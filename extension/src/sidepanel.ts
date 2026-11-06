interface SelectedTextResponse {
  text: string;
}

// FastAPI 서버의 응답 형식 (backend/main.py의 AnalyzeResponse와 같은 구조)
interface RiskSignal {
  type: string;
  // 서버가 입력 대화와 대조해 확인한 근거 문장
  evidence?: string[];
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

// 결과 카드에 붙이는 상태 class. 색상은 sidepanel.html의 CSS가 정한다.
const RISK_LEVEL_CLASSES: Record<string, string> = {
  SAFE: "safe",
  CAUTION: "caution",
  DANGER: "danger",
};

const ANALYZE_BUTTON_LABEL = "분석";

const getSelectionButton = document.getElementById("get-selection") as HTMLButtonElement;
const analyzeButton = document.getElementById("analyze") as HTMLButtonElement;
const statusMessage = document.getElementById("status") as HTMLParagraphElement;
const selectedSection = document.getElementById("selected-section") as HTMLElement;
const selectedTextBox = document.getElementById("selected-text") as HTMLPreElement;
const analysisError = document.getElementById("analysis-error") as HTMLParagraphElement;
const analysisResult = document.getElementById("analysis-result") as HTMLElement;
const riskLevelText = document.getElementById("risk-level") as HTMLSpanElement;
const safeMessage = document.getElementById("safe-message") as HTMLParagraphElement;
const signalSection = document.getElementById("signal-section") as HTMLDivElement;
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
      selectedSection.hidden = true;
      return null;
    }

    statusMessage.textContent = "";
    // innerHTML이 아닌 textContent를 사용해 페이지의 텍스트가 HTML로 해석되지 않게 한다.
    selectedTextBox.textContent = response.text;
    selectedSection.hidden = false;
    return response.text;
  } catch {
    // content script가 없는 페이지(chrome:// 등)이거나, 확장 프로그램 설치 전에 열린 탭인 경우
    statusMessage.textContent = "이 페이지에서는 텍스트를 가져올 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.";
    selectedSection.hidden = true;
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
      // Gemini 분석은 수 초 이상 걸릴 수 있다. 서버의 Gemini timeout(25초)보다 길게 잡는다.
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("분석 서버의 응답이 너무 늦습니다. 잠시 후 다시 시도해 주세요.");
    }
    // 서버가 꺼져 있거나 주소에 연결할 수 없으면 fetch 자체가 실패한다.
    throw new Error("분석 서버에 연결할 수 없습니다. FastAPI 서버가 실행 중인지 확인해 주세요.");
  }

  if (!response.ok) {
    // 서버가 보낸 사용자 안내 메시지({"detail": "..."})가 있으면 그대로 보여 준다.
    const body = await response.json().catch(() => null);
    if (typeof body?.detail === "string") {
      throw new Error(body.detail);
    }
    throw new Error(`분석 서버에서 오류가 발생했습니다. (HTTP ${response.status})`);
  }
  return (await response.json()) as AnalyzeResponse;
}

function createTextElement(tagName: string, className: string, text: string): HTMLElement {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

// 위험신호 이름 > 근거(evidence) > 판단 이유(reason) 순서로 그린다.
function createSignalItem(signal: RiskSignal): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "signal";
  item.append(createTextElement("div", "signal-type", signal.type));

  const evidence = signal.evidence ?? [];
  if (evidence.length > 0) {
    item.append(createTextElement("div", "field-label", "근거"));
    for (const quote of evidence) {
      item.append(createTextElement("blockquote", "evidence", `"${quote}"`));
    }
  }

  item.append(createTextElement("div", "field-label", "판단 이유"));
  item.append(createTextElement("div", "reason", signal.reason));
  return item;
}

function showAnalysisResult(result: AnalyzeResponse): void {
  riskLevelText.textContent = RISK_LEVEL_LABELS[result.riskLevel] ?? result.riskLevel;

  analysisResult.classList.remove("safe", "caution", "danger");
  const levelClass = RISK_LEVEL_CLASSES[result.riskLevel];
  if (levelClass !== undefined) {
    analysisResult.classList.add(levelClass);
  }

  // 위험 신호가 없으면 목록 대신 간단한 안내 문구만 보여 준다.
  const hasSignals = result.signals.length > 0;
  safeMessage.hidden = hasSignals || result.riskLevel !== "SAFE";
  signalSection.hidden = !hasSignals;
  signalList.replaceChildren(...result.signals.map(createSignalItem));

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
    analyzeButton.textContent = ANALYZE_BUTTON_LABEL;
  }
}

getSelectionButton.addEventListener("click", () => {
  void loadSelectedText();
});

analyzeButton.addEventListener("click", () => {
  void analyzeSelectedText();
});
