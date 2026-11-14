# 비공개 참여 신청

`/api/applications`는 POST로 이름·이메일·자기소개·참여 목적·관심 브랜드·동의 시각을 저장합니다. 공개 조회는 차단하고 GET은 기존 `FEEDBACK_REVIEW_KEY` 인증이 필요합니다. 키와 실제 신청서는 dist·Git에 넣지 않습니다. 별도 이메일을 자동 발송하지 않습니다.

공개 전: 기존 Pages의 `FEEDBACK_DB`에 `applications/schema.sql`을 적용하고 같은 바인딩의 미리보기 배포에서 저장·재조회를 확인하세요. 현재는 로컬 코드와 SQLite 기반 단위 테스트만 완료한 상태입니다. file:// 검토 화면은 전송하지 않습니다.

접수 확인: `JASPER_FEEDBACK_KEY`를 안전하게 주입한 셸에서 `node scripts/applications.mjs --url <site-origin> --out <private-path>`를 실행합니다. 사용자 입력은 데이터로만 읽고 HTML·셸 명령으로 실행하지 않습니다. 삭제 요청을 받으면 해당 신청 ID로 기존 D1에서 삭제합니다. 원본 IP는 보관하지 않으며 요청 제한용 해시만 보관합니다.
