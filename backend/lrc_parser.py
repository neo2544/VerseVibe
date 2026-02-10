"""LRC 포맷 파싱 모듈"""
import re
from typing import List, Dict


def parse_lrc(lrc_text: str) -> List[Dict]:
    """
    LRC 포맷 텍스트를 파싱하여 시간+가사 리스트로 변환

    입력: "[00:42.50] Game start"
    출력: [{"time": 42.5, "text": "Game start"}]
    """
    if not lrc_text:
        return []

    lyrics = []
    # LRC 타임스탬프 패턴: [mm:ss.xx] 또는 [mm:ss:xx]
    pattern = r'\[(\d{2}):(\d{2})[.:](\d{2,3})\]\s*(.*)'

    for line in lrc_text.split('\n'):
        match = re.match(pattern, line.strip())
        if match:
            minutes = int(match.group(1))
            seconds = int(match.group(2))
            milliseconds = match.group(3)

            # 2자리면 10ms 단위, 3자리면 1ms 단위
            if len(milliseconds) == 2:
                ms = int(milliseconds) * 10
            else:
                ms = int(milliseconds)

            time_seconds = minutes * 60 + seconds + ms / 1000
            text = match.group(4).strip()

            lyrics.append({
                "time": round(time_seconds, 2),
                "text": text if text else "♪"
            })

    # 시간순 정렬
    lyrics.sort(key=lambda x: x["time"])
    return lyrics


def find_current_line(lyrics: List[Dict], current_time: float) -> int:
    """
    현재 시간에 해당하는 가사 라인 인덱스 반환
    """
    if not lyrics:
        return -1

    current_index = -1
    for i, lyric in enumerate(lyrics):
        if lyric["time"] <= current_time:
            current_index = i
        else:
            break

    return current_index
