from typing import List, Dict, Any

MOODS: Dict[str, int] = {
    "great": 0,
    "good": 5,
    "okay": 12,
    "stressed": 24,
    "overwhelmed": 34,
}

RECS: List[Dict[str, Any]] = [
    {
        "id": "breath",
        "title": "2-minute breathing exercise",
        "blurb": "Slow, even breaths settle your nervous system and clear your head.",
        "mins": 2,
        "secs": 120,
        "tint": "blue",
    },
    {
        "id": "walk",
        "title": "Take a 10-minute walk",
        "blurb": "Fresh air and movement lift your mood. Leave your phone in your pocket.",
        "mins": 10,
        "secs": 600,
        "tint": "green",
    },
    {
        "id": "screen",
        "title": "Take a screen break",
        "blurb": "Look away, stretch and rest your eyes. Try the 20-20-20 rule.",
        "mins": 5,
        "secs": 300,
        "tint": "lav",
    },
    {
        "id": "sleep",
        "title": "Improve your sleep routine",
        "blurb": "Wind down with dim lights and no scrolling for the last half hour.",
        "mins": 15,
        "secs": 900,
        "tint": "blue",
    },
    {
        "id": "focus",
        "title": "Try a focused study session",
        "blurb": "25 minutes on one topic, then a real break. Small blocks beat marathons.",
        "mins": 25,
        "secs": 1500,
        "tint": "green",
    },
]


def level_of(score: int) -> str:
    if score < 35:
        return "Low"
    elif score < 65:
        return "Moderate"
    return "High"


def compute_stress_score(
    sleep: float,
    study: float,
    screen: float,
    exam: int,
    mood: str = "okay",
    note: str = "",
) -> int:
    sleep_p = max(0.0, 8.0 - sleep) * 8.0 + (4.0 if sleep > 10.0 else 0.0)
    study_p = max(0.0, study - 4.0) * 3.0
    screen_p = max(0.0, screen - 3.0) * 4.0

    if exam <= 3:
        exam_p = 18.0
    elif exam <= 7:
        exam_p = 14.0
    elif exam <= 14:
        exam_p = 9.0
    elif exam <= 30:
        exam_p = 5.0
    else:
        exam_p = 2.0

    mood_p = float(MOODS.get(mood, 10))

    keywords = [
        "anxious",
        "panic",
        "can't",
        "cannot",
        "tired",
        "exhausted",
        "stress",
        "worried",
        "scared",
        "hopeless",
    ]
    note_lower = (note or "").lower()
    matches = sum(1 for w in keywords if w in note_lower)
    note_p = min(12.0, matches * 4.0)

    raw = 10.0 + sleep_p + study_p + screen_p + exam_p + mood_p + note_p
    score = round(max(4.0, min(98.0, raw)))
    return score


def get_recommendations(
    sleep: float, study: float, screen: float
) -> List[Dict[str, Any]]:
    weights = {
        "breath": 2,
        "walk": 1,
        "screen": 4 if screen > 5.0 else 0,
        "sleep": 4 if sleep < 7.0 else 0,
        "focus": 0 if study > 7.0 else 1,
    }
    sorted_recs = sorted(RECS, key=lambda r: weights.get(r["id"], 0), reverse=True)
    return sorted_recs
