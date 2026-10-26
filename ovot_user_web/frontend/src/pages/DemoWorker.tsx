import { useState } from 'react'
import { Brand } from '../components/Brand'
import { W106, instruction } from '../demo/b03'
import { demoStore, useDemoState } from '../lib/demoStore'
import './demoWorker.css'

/** 지시를 소리로 다시 들려준다 (브라우저 음성 합성) */
function speak(text: string, lang: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang
  window.speechSynthesis.speak(u)
}

/** DEMO — 협력사 작업자 W-106 화면. 관리자 콘솔의 결정(야드 일정 조정)을 읽고, 수신 확인을 관리자에게 보낸다. */
export function DemoWorkerPage() {
  const { state, link, pending } = useDemoState()
  const ins = instruction(state)
  const acked = !!state.w106AckAt
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(false)

  return (
    <div className="dw">
      <header className="dw-head">
        <Brand />
        <div className="dw-who">
          <strong>{W106.id} · {W106.langLabel}</strong>
          <span>{W106.zone}</span>
          <span>{W106.company} · {W106.checkIn}</span>
        </div>
      </header>

      <main className="dw-main">
        <section className="dw-card" aria-labelledby="dw-new">
          <div className="dw-card-top">
            <h1 id="dw-new">Chỉ thị mới</h1>
            <span className="badge badge-risk-medium">새 지시 · {W106.receivedAt}</span>
            {ins.changed && <span className="badge badge-danger" role="status">시각 변경됨</span>}
          </div>

          <p className="dw-vi" lang="vi">{ins.vi}</p>
          <p className="dw-ko" lang="ko">{ins.ko}</p>

          <dl className="dw-facts">
            <div><dt>Khối · 블록</dt><dd>{W106.block}</dd></div>
            <div><dt>Bản vẽ · 도면</dt><dd>{W106.rev}</dd></div>
            <div><dt>Giờ · 시각</dt><dd className={ins.changed ? 'dw-changed' : undefined}>{ins.time}</dd></div>
          </dl>

          <button className="btn btn-secondary" onClick={() => speak(ins.vi, 'vi-VN')}>
            Nghe lại · 다시 듣기
          </button>
        </section>

        {acked ? (
          <p className="alert alert-success dw-sent" role="status">
            반장에게 전송됨 · Đã gửi cho tổ trưởng {pending ? '(연결되면 자동 전송)' : `· ${state.w106AckAt}`}
          </p>
        ) : (
          <button className="btn btn-primary btn-xl" onClick={() => demoStore.ack()}>
            Đã nhận · 확인했습니다
          </button>
        )}

        <button
          className={`btn btn-lg ${reporting ? 'btn-primary' : 'btn-secondary'}`}
          aria-pressed={reporting}
          onClick={() => {
            if (reporting) setReported(true)
            setReporting((r) => !r)
          }}
        >
          {reporting ? '녹음 중 · 누르면 보고 전송' : 'Báo cáo bằng giọng nói · 음성 보고'}
        </button>
        {reported && !reporting && <p className="alert alert-info" role="status">음성 보고를 반장에게 보냈습니다.</p>}

        <section className="dw-card" aria-labelledby="dw-tasks">
          <h2 id="dw-tasks">Việc của tôi · 내 작업</h2>
          <ul className="dw-tasks">
            <li>
              <span>B-03 배관 취부 {W106.rev}</span>
              <span className="badge badge-neutral">대기</span>
            </li>
            <li>
              <span>B-03 블록 이동 준비</span>
              <span className="badge badge-risk-medium num">{ins.time}</span>
            </li>
          </ul>
        </section>
      </main>

      <footer className="dw-foot">
        <p>오프라인일 때는 기기에 저장 후 자동 전송합니다.</p>
        <p className={`dw-link ${link}`}>{link === 'online' ? '연결됨' : '오프라인 · 저장 후 전송'}</p>
      </footer>
    </div>
  )
}
