"""
OpenCV + MediaPipe FaceMesh visual cue analyzer for offline/local Python execution.
Clearly separates measured eye-contact/face-presence frames from unavailable fallbacks.
"""
from dataclasses import dataclass
import cv2

try:
    import mediapipe as mp
    MEDIAPIPE_AVAILABLE = True
except ImportError:
    MEDIAPIPE_AVAILABLE = False


@dataclass
class VisualCueSummary:
    eye_contact_ratio: float  # -1.0 when unavailable
    face_presence_ratio: float  # -1.0 when unavailable
    status: str


def analyze_video_eye_contact(video_path: str, sample_every_n_frames: int = 8) -> VisualCueSummary:
    if not MEDIAPIPE_AVAILABLE:
        return VisualCueSummary(-1.0, -1.0, "Unavailable (MediaPipe Not Installed)")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return VisualCueSummary(-1.0, -1.0, "Unavailable (Video Stream Unreadable)")

    mp_face_mesh = mp.solutions.face_mesh
    total_sampled = 0
    face_detected_frames = 0
    centered_gaze_frames = 0
    frame_idx = 0

    with mp_face_mesh.FaceMesh(
        static_image_mode=False,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ) as face_mesh:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            frame_idx += 1
            if frame_idx % sample_every_n_frames != 0:
                continue

            total_sampled += 1
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            res = face_mesh.process(rgb)
            if not res.multi_face_landmarks:
                continue

            face_detected_frames += 1
            lm = res.multi_face_landmarks[0].landmark
            nose = lm[1]
            left_eye = lm[33]
            right_eye = lm[263]
            forehead = lm[10]
            chin = lm[152]

            eye_mid_x = (left_eye.x + right_eye.x) / 2.0
            face_width = max(abs(right_eye.x - left_eye.x), 0.1)
            yaw_offset = abs(nose.x - eye_mid_x) / face_width

            face_mid_y = (forehead.y + chin.y) / 2.0
            face_height = max(abs(chin.y - forehead.y), 0.15)
            pitch_offset = abs(nose.y - face_mid_y) / face_height

            if yaw_offset < 0.18 and pitch_offset < 0.22:
                centered_gaze_frames += 1

    cap.release()
    if total_sampled == 0:
        return VisualCueSummary(-1.0, -1.0, "Unavailable (Zero Frames)")

    return VisualCueSummary(
        eye_contact_ratio=round((centered_gaze_frames / total_sampled) * 100.0, 2),
        face_presence_ratio=round((face_detected_frames / total_sampled) * 100.0, 2),
        status="Measured (OpenCV + MediaPipe)",
    )
