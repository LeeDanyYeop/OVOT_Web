# Unity 디지털트윈 연동 안내

현재 상태: **Unity 빌드가 없어 연동되지 않았습니다.** 웹은 같은 규약을 따르는 임시 구역도를 보여주며, 화면에 `디지털트윈 연결 전 · 구역도` 라고 표시합니다.
아래 코드는 연결 지점을 미리 만들어 둔 것이며, 실제 Unity 빌드로 검증한 적은 없습니다.

## 1. 필요한 자료 (Unity 담당자)

1. **Unity WebGL 빌드** — `Build/` 폴더의 `*.loader.js`, `*.data(.br/.gz)`, `*.framework.js(.br/.gz)`, `*.wasm(.br/.gz)`
   - 압축(.br/.gz)을 쓰면 웹 서버가 `Content-Encoding` 헤더를 보내도록 설정하거나, Player Settings 에서 Decompression Fallback 을 켜 주세요.
2. **오브젝트 이름 목록** — 구역·블록을 나타내는 GameObject 이름 (예: `Zone_A`, `Block_P1`)
3. **브리지 GameObject** — 웹 메시지를 받을 오브젝트 1개 (기본 이름 `OVOTBridge`)
4. 구역별 **zone_id** 대응표 — DB 의 `tasks.zone_id` 값과 같아야 합니다.

## 2. 웹 설정

`public/ovot-config.json` (배포 후에는 `dist/ovot-config.json`)

```json
"unity": {
  "enabled": true,
  "loaderUrl": "unity/Build/ovot.loader.js",
  "dataUrl": "unity/Build/ovot.data.br",
  "frameworkUrl": "unity/Build/ovot.framework.js.br",
  "codeUrl": "unity/Build/ovot.wasm.br",
  "bridgeObject": "OVOTBridge"
}
```

`src/settings/zone-map.json` 의 `unityObject`(구역)와 `unityObjects`(블록·작업)를 실제 오브젝트 이름으로 채웁니다.
빌드 로드에 실패하면 웹은 `Unity 로드 실패` 를 표시하고 임시 구역도로 돌아갑니다.

## 3. 메시지 규약 (src/twin/bridge.ts)

### 웹 → Unity — `unityInstance.SendMessage("OVOTBridge", 메서드, JSON 문자열)`

| 메서드 | 보내는 때 | JSON |
|---|---|---|
| `SelectZone` | 웹에서 구역을 선택·해제했을 때 | `{ "zone_id": "ZONE-A" \| null, "unity_object": "Zone_A" \| null }` |
| `ApplyState` | 서버 조회에 **성공**했을 때만 (실패 중에는 보내지 않음) | 아래 예시 |

```json
{
  "generated_at": "2026-10-10T08:31:00.000Z",
  "zones": [
    { "zone_id": "ZONE-A", "label": "작업구역 A", "unity_object": "Zone_A",
      "status": "attention", "needs_confirmation": 1, "task_headline": "작업 2건 · 완료" }
  ],
  "tasks": [
    { "task_id": "T-101", "block_id": "P-1", "zone_id": "ZONE-A", "status": "DONE", "unity_objects": ["Block_P1"] }
  ]
}
```
`status`: `normal` | `attention`(확인 필요 이벤트 있음) | `nodata`

### Unity → 웹 — 오브젝트 클릭

`Assets/Plugins/WebGL/OVOTBridge.jslib`
```js
mergeInto(LibraryManager.library, {
  OVOT_ObjectClicked: function (namePtr) {
    var name = UTF8ToString(namePtr);
    if (window.OVOTTwin) window.OVOTTwin.onObjectClicked(name);
  }
});
```

`OVOTBridge.cs` (예시)
```csharp
using System.Runtime.InteropServices;
using UnityEngine;

public class OVOTBridge : MonoBehaviour {
  [DllImport("__Internal")] static extern void OVOT_ObjectClicked(string name);

  public void SelectZone(string json)  { /* JsonUtility.FromJson 으로 zone_id 읽고 해당 오브젝트 강조 */ }
  public void ApplyState(string json)  { /* zones[].status 로 색 표시, tasks[].status 로 블록 상태 표시 */ }

  // 구역·블록 오브젝트의 클릭 처리에서 호출
  public static void NotifyClicked(string objectName) {
  #if UNITY_WEBGL && !UNITY_EDITOR
    OVOT_ObjectClicked(objectName);
  #endif
  }
}
```

웹은 받은 오브젝트 이름을 `zone-map.json` 으로 `zone_id` 로 바꿉니다. 블록 오브젝트가 여러 구역의 작업과 연결되어 있으면 구역을 확정하지 않고 안내 문구만 표시합니다.
iframe 으로 따로 띄우는 경우 `window.parent.postMessage({ type: 'ovot-twin:object-click', object: 'Zone_A' }, '*')` 도 받습니다.

## 4. 원칙
- Unity 는 PostgreSQL·FastAPI 에 직접 접속하지 않습니다. 웹이 받은 값만 표시합니다.
- 화면에 보이는 작업 상태는 서버가 저장한 값입니다. Unity 쪽에서 상태를 바꾸는 기능은 없습니다.
