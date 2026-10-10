"""Voice question → answer card, grounded in the approved work guide.

Uses the Gemini REST API (audio in, JSON out) when GEMINI_API_KEY is set. The model
only sees the worker's current work context; anything outside the guide or any safety /
quality judgement is routed to the responsible person instead of being answered.
"""

import base64
import json
import logging

import httpx

from .. import config

log = logging.getLogger(__name__)

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

INSTRUCTIONS = """너는 조선소 현장 작업 도우미 '오봇'이다. 작업자가 음성으로 질문했다.
아래 [작업 맥락]과 [승인된 지침]에 있는 내용만 근거로 한국어로 짧게 답한다.

규칙:
- headline: 핵심 한 문장 (40자 이내, 존댓말 '~하세요/~예요')
- details: 근거나 다음 행동 0~3개, 각 45자 이내
- 지침에 없는 내용은 추측하지 말고 needs_supervisor=true, headline에 담당자 확인을 안내한다
- 안전·품질 판단(작업 가능 여부, 합격/불합격, 규정 예외 등)이 필요한 질문은 needs_supervisor=true
- 그림(기준면·방향)이 도움이 되면 show_figure=true
- transcript: 작업자가 한 말을 그대로 받아 적는다. 말이 없거나 알아들을 수 없으면 빈 문자열

JSON만 출력한다:
{"transcript": str, "headline": str, "details": [str], "show_figure": bool, "needs_supervisor": bool}
"""


class AssistUnavailable(Exception):
    pass


def ai_enabled() -> bool:
    return bool(config.GEMINI_API_KEY)


async def answer_voice(audio: bytes, mime: str, context: dict) -> dict:
    if not ai_enabled():
        raise AssistUnavailable("AI 키가 설정되지 않았습니다")
    prompt = INSTRUCTIONS + "\n[작업 맥락 · 승인된 지침]\n" + json.dumps(context, ensure_ascii=False, indent=1)
    body = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"inline_data": {"mime_type": mime, "data": base64.b64encode(audio).decode()}},
                    {"text": prompt},
                ],
            }
        ],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
    }
    url = ENDPOINT.format(model=config.GEMINI_MODEL)
    try:
        async with httpx.AsyncClient(timeout=40) as client:
            res = await client.post(url, json=body, headers={"x-goog-api-key": config.GEMINI_API_KEY})
        res.raise_for_status()
        text = res.json()["candidates"][0]["content"]["parts"][0]["text"]
        data = json.loads(text)
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        log.warning("assist AI call failed: %s", exc)
        raise AssistUnavailable("AI 응답을 받지 못했습니다") from exc

    return {
        "transcript": str(data.get("transcript") or "").strip(),
        "headline": str(data.get("headline") or "담당자에게 확인하세요.").strip(),
        "details": [str(d).strip() for d in (data.get("details") or [])][:3],
        "show_figure": bool(data.get("show_figure")),
        "needs_supervisor": bool(data.get("needs_supervisor")),
    }
