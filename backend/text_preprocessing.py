"""LLM 분석 전에 사용자가 선택한 거래 대화 텍스트를 정규화한다.

의미가 바뀌지 않는 문자 수준의 정리만 한다.
'5' -> '오', 'r' -> 'ㅏ' 처럼 문맥에 따라 뜻이 달라지는 치환은 하지 않고 LLM에 맡긴다.
"""

import re
import unicodedata
from dataclasses import dataclass

# 한글 호환 자모(ㄱ~ㆎ). NFKC를 적용하면 조합형 자모(U+1100대)로 바뀌고,
# 'ㅋㅏ'가 '카'로 합쳐지는 등 사실상 문자를 해독해 버리므로 정규화 대상에서 제외한다.
_HANGUL_COMPAT_JAMO = re.compile(r"([ㄱ-ㆎ]+)")

# 화면에 보이지 않는 한글 채움 문자. 일반 대화에는 쓰이지 않고 글자 사이 끼워 넣기에 쓰인다.
_HANGUL_FILLERS = {"ᅟ", "ᅠ", "ㅤ", "ﾠ"}

# Cf: 서식 문자(ZWSP, ZWJ, BOM, 방향 제어 문자 등)
# Mn, Me: 결합 문자(취소선 U+0336, 밑줄 U+0332 등)
# Cc: 제어 문자 (줄바꿈과 탭은 아래에서 따로 처리)
_REMOVED_CATEGORIES = {"Cf", "Mn", "Me", "Cc"}

# 줄바꿈을 제외한 모든 유니코드 공백(탭, NFKC 이후에도 남은 특수 공백 포함)
_SPACES = re.compile(r"[^\S\n]+")
_BLANK_LINES = re.compile(r"\n{3,}")


@dataclass(frozen=True)
class PreprocessedText:
    # 사용자가 선택한 원문. 어떤 경우에도 수정하지 않는다.
    original_text: str
    # 문자 수준 정규화만 적용한 문자열.
    normalized_text: str


def preprocess_text(text: str) -> PreprocessedText:
    return PreprocessedText(original_text=text, normalized_text=normalize_text(text))


def normalize_text(text: str) -> str:
    # 1. 줄바꿈 통일. 여러 턴의 대화는 줄 단위로 구분되므로 줄 구조는 유지한다.
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace(" ", "\n").replace(" ", "\n")

    # 2. NFKC 호환 정규화 (ⓚ -> k, Ａ -> A, 전각 숫자 -> 숫자, 특수 공백 -> 공백 등)
    text = _nfkc_except_hangul_jamo(text)

    # 3. 보이지 않는 문자, 결합 문자, 제어 문자 제거
    text = "".join(ch for ch in text if _keep_char(ch))

    # 4. 공백 정리: 줄마다 연속 공백을 하나로 줄이고, 빈 줄은 최대 한 줄만 남긴다.
    lines = [_SPACES.sub(" ", line).strip() for line in text.split("\n")]
    text = _BLANK_LINES.sub("\n\n", "\n".join(lines))
    return text.strip()


def _nfkc_except_hangul_jamo(text: str) -> str:
    # split에 그룹을 쓰면 홀수 번째 조각이 호환 자모 구간이다.
    parts = _HANGUL_COMPAT_JAMO.split(text)
    return "".join(
        part if i % 2 == 1 else unicodedata.normalize("NFKC", part)
        for i, part in enumerate(parts)
    )


def _keep_char(ch: str) -> bool:
    if ch in ("\n", "\t"):
        return True
    if ch in _HANGUL_FILLERS:
        return False
    return unicodedata.category(ch) not in _REMOVED_CATEGORIES
