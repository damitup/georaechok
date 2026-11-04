"""실행: backend 폴더에서 python -m unittest test_text_preprocessing -v"""

import unittest

from text_preprocessing import preprocess_text


class PreprocessTextTest(unittest.TestCase):
    def assert_normalized(self, original: str, expected: str) -> None:
        result = preprocess_text(original)
        self.assertEqual(result.original_text, original)
        self.assertEqual(result.normalized_text, expected)

    def test_plain_sentence_is_unchanged(self):
        self.assert_normalized("안전결제로 거래하고 싶습니다.", "안전결제로 거래하고 싶습니다.")

    def test_multi_turn_keeps_line_breaks(self):
        conversation = (
            "안전결제로 할게요.\n"
            "그건 지금 안 됩니다.\n"
            "그럼 어떻게 거래할까요?\n"
            "거기서 계좌 알려드릴게요."
        )
        self.assert_normalized(conversation, conversation)

    def test_windows_line_breaks_and_extra_spaces(self):
        self.assert_normalized(
            "  안전결제로   할게요.\r\n\r\n\r\n\t그건 지금　안 됩니다.  ",
            "안전결제로 할게요.\n\n그건 지금 안 됩니다.",
        )

    def test_combining_strikethrough_is_removed(self):
        self.assert_normalized("카̶카̶오̶톡̶", "카카오톡")

    def test_compatibility_characters(self):
        # ⓚ(U+24DA)는 원 문자 소문자 k이므로 NFKC 결과는 소문자 k이다.
        self.assert_normalized("ⓚⓚ5로 괜찮으세요?", "kk5로 괜찮으세요?")
        self.assert_normalized("ⓀⓀ5", "KK5")
        self.assert_normalized("ＫＡＫＡＯ１２３", "KAKAO123")

    def test_ambiguous_characters_are_not_decoded(self):
        # 5 -> 오, r -> ㅏ 같은 의미 추정 치환은 하지 않는다.
        self.assert_normalized("ⓚⓚ5", "kk5")
        self.assert_normalized("ㅋrㅋr5", "ㅋrㅋr5")
        self.assertNotIn("카카오", preprocess_text("ⓚⓚ5로 괜찮으세요?").normalized_text)

    def test_hangul_compatibility_jamo_are_preserved(self):
        # 일반 NFKC는 'ㅋㅏ'를 '카'로 합치고 'ㅋㅋ'를 조합형 자모로 바꾼다. 그대로 두어야 한다.
        self.assert_normalized("ㅋㅋ ㄱㅅ ㅋㅏ", "ㅋㅋ ㄱㅅ ㅋㅏ")

    def test_zero_width_characters_are_removed(self):
        self.assert_normalized("카​카‌오‍톡﻿", "카카오톡")
        self.assert_normalized("계⁠좌­번‮호", "계좌번호")

    def test_hangul_filler_is_removed(self):
        self.assert_normalized("카ㅤ카ㅤ오", "카카오")

    def test_control_characters_are_removed(self):
        self.assert_normalized("계좌\x00\x07번호\x1b", "계좌번호")

    def test_invisible_only_text_becomes_empty(self):
        self.assert_normalized("​​", "")


if __name__ == "__main__":
    unittest.main()
