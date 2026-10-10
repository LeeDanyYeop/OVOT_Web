// 공개 배포용: 빌드 결과(dist)의 설정을 DEMO(샘플 데이터)로 바꾼다.
// 공개된 FastAPI 서버(HTTPS)가 생기면 이 단계를 빼고 dist/ovot-config.json 의 mode·apiBaseUrl 을 live·서버 주소로 두면 된다.
import { readFileSync, writeFileSync } from 'node:fs'

const p = new URL('../dist/ovot-config.json', import.meta.url)
const c = JSON.parse(readFileSync(p, 'utf8'))
c._comment = '배포용 설정. 아직 공개 서버가 없어 DEMO(샘플 데이터)로 시작합니다. DB 접속 정보는 절대 넣지 마세요.'
c.mode = 'demo'
c.apiBaseUrl = ''
writeFileSync(p, JSON.stringify(c, null, 2) + '\n')
console.log('dist/ovot-config.json → mode: demo')
