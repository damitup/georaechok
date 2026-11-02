from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="거래촉 API")

# Side Panel의 출처(origin)는 chrome-extension://<확장 프로그램 ID> 이다.
# manifest.json의 host_permissions가 있으면 CORS 없이도 요청되지만,
# 어떤 출처를 받을지 서버에서도 명시해 둔다. 일반 웹사이트 출처는 허용하지 않는다.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"chrome-extension://.*",
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)


# 요청 본문. Spring Boot의 Request DTO 역할을 한다.
class AnalyzeRequest(BaseModel):
    text: str = Field(min_length=1)


class RiskSignal(BaseModel):
    type: str
    reason: str


# 응답 본문. Extension에서 그대로 쓰도록 JSON 키 이름(camelCase)을 맞춘다.
class AnalyzeResponse(BaseModel):
    riskLevel: str
    signals: list[RiskSignal]
    recommendation: str


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    # 아직 AI를 연결하지 않았으므로 통신 확인용 고정 결과를 돌려준다.
    print(f"[analyze] 받은 텍스트 ({len(request.text)}자): {request.text[:50]}")
    return AnalyzeResponse(
        riskLevel="CAUTION",
        signals=[
            RiskSignal(
                type="테스트 위험 신호",
                reason="현재는 AI 연결 전 통신 테스트용 결과입니다.",
            )
        ],
        recommendation="추가 확인이 필요합니다.",
    )
