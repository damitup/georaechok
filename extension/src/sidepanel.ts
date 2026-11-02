interface SelectedTextResponse {
  text: string;
}

// FastAPI 서버의 응답 형식 (backend/main.py의 AnalyzeResponse와 같은 구조)
interface RiskSignal {
  type: string;
  reason: string;
}

interface AnalyzeResponse {
  riskLevel: string;
  signals: RiskSignal[];
  recommendation: string;
}

const API_BASE_URL = "http://127.0.0.1:8000";

const RISK_LEVEL_LABELS: Record<string, string> = {
  SAFE: "안전",
  CAUTION: "주의",
  DANGER: "위험",
};

const getSelectionButton = document.getElementById("get-selection") as HTMLButtonElement;
const analyzeButton = document.getElementById("analyze") as HTMLButtonElement;
const statusMessage = document.getElementById("status") as HTMLParagraphElement;
const selectedTextBox = document.getElementById("selected-text") as HTMLPreElement;
const analysisError = document.getElementById("analysis-error") as HTMLParagraphElement;
const analysisResult = document.getElementById("analysis-result") as HTMLElement;
const riskLevelText = document.getElementById("risk-level") as HTMLSpanElement;
const signalList = document.getElementById("signal-list") as HTMLUListElement;
const recommendationText = document.getElementById("recommendation") as HTMLParagraphElement;

// 현재 탭에서 선택된 텍스트를 가져와 화면에 표시한다. 가져오지 못하면 null을 반환한다.
async function loadSelectedText(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) {
    statusMessage.textContent = "현재 탭을 찾을 수 없습니다.";
    return null;
  }

  try {
    const response: SelectedTextResponse = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_SELECTED_TEXT",
    });

    if (response.text === "") {
      statusMessage.textContent = "선택된 텍스트가 없습니다. 페이지에서 대화 내용을 드래그한 뒤 다시 눌러 주세요.";
      selectedTextBox.hidden = true;
      return null;
    }

    statusMessage.textContent = "선택한 대화 내용";
    // innerHTML이 아닌 textContent를 사용해 페이지의 텍스트가 HTML로 해석되지 않게 한다.
    selectedTextBox.textContent = response.text;
    selectedTextBox.hidden = false;
    return response.text;
  } catch {
    // content script가 없는 페이지(chrome:// 등)이거나, 확장 프로그램 설치 전에 열린 탭인 경우
    statusMessage.textContent = "이 페이지에서는 텍스트를 가져올 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.";
    selectedTextBox.hidden = true;
    return null;
  }
}

async function requestAnalysis(text: string): Promise<AnalyzeResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("분석 서버의 응답이 너무 늦습니다. 잠시 후 다시 시도해 주세요.");
    }
    // 서버가 꺼져 있거나 주소에 연결할 수 없으면 fetch 자체가 실패한다.
    throw new Error("분석 서버에 연결할 수 없습니다. FastAPI 서버가 실행 중인지 확인해 주세요.");
  }

  if (!response.ok) {
    throw new Error(`분석 서버에서 오류가 발생했습니다. (HTTP ${response.status})`);
  }
  return (await response.json()) as AnalyzeResponse;
}

function showAnalysisResult(result: AnalyzeResponse): void {
  riskLevelText.textContent = RISK_LEVEL_LABELS[result.riskLevel] ?? result.riskLevel;

  signalList.replaceChildren();
  if (result.signals.length === 0) {
    const item = document.createElement("li");
    item.textContent = "발견된 위험 신호가 없습니다.";
    signalList.append(item);
  }
  for (const signal of result.signals) {
    const item = document.createElement("li");
    const type = document.createElement("strong");
    type.textContent = signal.type;
    const reason = document.createElement("div");
    reason.textContent = `판단 이유: ${signal.reason}`;
    item.append(type, reason);
    signalList.append(item);
  }

  recommendationText.textContent = result.recommendation;
  analysisResult.hidden = false;
}

async function analyzeSelectedText(): Promise<void> {
  analysisError.hidden = true;
  analysisResult.hidden = true;

  const text = await loadSelectedText();
  if (text === null) {
    return;
  }

  analyzeButton.disabled = true;
  analyzeButton.textContent = "분석 중...";
  try {
    showAnalysisResult(await requestAnalysis(text));
  } catch (error) {
    analysisError.textContent = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
    analysisError.hidden = false;
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.textContent = "거래 분석";
  }
}

getSelectionButton.addEventListener("click", () => {
  void loadSelectedText();
});

analyzeButton.addEventListener("click", () => {
  void analyzeSelectedText();
});
