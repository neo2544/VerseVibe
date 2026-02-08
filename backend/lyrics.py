"""가사 조회 모듈 (LRCLIB + Netease 폴백)"""
import requests
from typing import Optional, List, Dict
from lrc_parser import parse_lrc


LRCLIB_API = "https://lrclib.net/api/search"
NETEASE_SEARCH_API = "https://music.163.com/api/search/get"
NETEASE_LYRIC_API = "https://music.163.com/api/song/lyric"

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; VerseVibe/1.0)"}
TIMEOUT = 10


def fetch_from_lrclib(title: str, artist: str) -> Optional[str]:
    """LRCLIB에서 싱크 가사 조회"""
    try:
        response = requests.get(
            LRCLIB_API,
            params={"track_name": title, "artist_name": artist},
            headers=HEADERS,
            timeout=TIMEOUT
        )

        if response.status_code == 200:
            results = response.json()
            for item in results:
                if item.get("syncedLyrics"):
                    return item["syncedLyrics"]
    except Exception as e:
        print(f"LRCLIB 조회 실패: {e}")

    return None


def fetch_from_netease(title: str, artist: str) -> Optional[str]:
    """Netease에서 싱크 가사 조회"""
    try:
        # 곡 검색
        search_response = requests.get(
            NETEASE_SEARCH_API,
            params={"s": f"{artist} {title}", "type": 1, "limit": 5},
            headers=HEADERS,
            timeout=TIMEOUT
        )

        if search_response.status_code != 200:
            return None

        search_data = search_response.json()
        songs = search_data.get("result", {}).get("songs", [])

        if not songs:
            return None

        song_id = songs[0]["id"]

        # 가사 조회
        lyric_response = requests.get(
            NETEASE_LYRIC_API,
            params={"id": song_id, "lv": 1},
            headers=HEADERS,
            timeout=TIMEOUT
        )

        if lyric_response.status_code == 200:
            lyric_data = lyric_response.json()
            lrc = lyric_data.get("lrc", {}).get("lyric", "")

            # 싱크 가사인지 확인 (타임스탬프 포함 여부)
            if "[0" in lrc:
                return lrc

    except Exception as e:
        print(f"Netease 조회 실패: {e}")

    return None


def get_synced_lyrics(title: str, artist: str) -> List[Dict]:
    """
    싱크 가사 조회 (LRCLIB -> Netease 폴백)

    반환: [{"time": 42.5, "text": "가사 라인"}, ...]
    """
    # LRCLIB 먼저 시도
    lrc_text = fetch_from_lrclib(title, artist)

    # 없으면 Netease 시도
    if not lrc_text:
        lrc_text = fetch_from_netease(title, artist)

    if not lrc_text:
        return []

    return parse_lrc(lrc_text)


if __name__ == "__main__":
    # 테스트
    lyrics = get_synced_lyrics("APT.", "ROSÉ")
    print(f"가사 {len(lyrics)}줄 조회됨")
    for line in lyrics[:5]:
        print(f"  [{line['time']:.2f}] {line['text']}")
