from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ai_analyzer import AnalysisError, AnalyzeResponse, analyze_conversation, check_settings
from text_preprocessing import preprocess_text


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # 설정이 없어도 서버는 띄우고, 원인을 시작 로그에 알린다. 분석 요청에는 503 오류로 응답한다.
    settings_problem = check_settings()
    if settings_problem:
        print(f"[startup] 경고: {settings_problem} /analyze 요청은 실패합니다.")
    yield


app = FastAPI(title="거래촉 API", lifespan=lifespan)

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


# 응답 본문(AnalyzeResponse)은 Gemini Structured Output 스키마와 같으므로 ai_analyzer.py에 정의한다.
@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    # 원문은 덮어쓰지 않고, 정규화 결과와 함께 보관한다. Gemini에 둘 다 전달한다.
    preprocessed = preprocess_text(request.text)

    # 거래 대화에는 개인정보가 있을 수 있으므로 내용은 출력하지 않고 길이만 확인한다.
    line_count = len(preprocessed.normalized_text.splitlines())
    print(
        f"[analyze] 원문 {len(preprocessed.original_text)}자, "
        f"정규화 {len(preprocessed.normalized_text)}자, {line_count}줄"
    )

    try:
        result = analyze_conversation(preprocessed)
    except AnalysisError as error:
        # Extension은 {"detail": "..."}의 메시지를 그대로 사용자에게 보여 준다.
        raise HTTPException(status_code=error.status_code, detail=error.message) from error

    print(f"[analyze] 결과 {result.riskLevel}, 신호 {len(result.signals)}개")
    return result
