import requests

from backend import attendance_api as ajyal_api


def make_response(url: str, body: bytes = b"") -> requests.Response:
    response = requests.Response()
    response.status_code = 200
    response.url = url
    response._content = body
    return response


def remove_session(session_id: str) -> None:
    with ajyal_api.sessions_lock:
        ajyal_api.sessions.pop(session_id, None)


def test_login_preserves_ajyal_otp_challenge(monkeypatch):
    challenge = make_response(
        ajyal_api.LOGIN_URL,
        b'<form id="LogIn"><input name="tbAuthenticationCode"></form>',
    )
    login_result = ajyal_api.LoginResult(False, ajyal_api.LOGIN_URL, 200, challenge)
    monkeypatch.setattr(ajyal_api, "login", lambda *args, **kwargs: login_result)

    result = ajyal_api.auth_login(ajyal_api.LoginRequest(username="test-user", password="test-password"))

    try:
        state = ajyal_api.get_session(result.session_id)
        assert result.requires_otp is True
        assert result.authenticated is False
        assert state.pending_otp is True
        assert state.otp_response is challenge
        assert state.authenticated is False
    finally:
        remove_session(result.session_id)


def test_valid_otp_completes_existing_ajyal_session(monkeypatch):
    session_id, state = ajyal_api.new_session()
    state.pending_otp = True
    state.otp_response = make_response(ajyal_api.LOGIN_URL, b"otp form")
    accepted = ajyal_api.LoginResult(
        True,
        ajyal_api.ATTENDANCE_URL,
        200,
        make_response(ajyal_api.ATTENDANCE_URL),
    )
    monkeypatch.setattr(ajyal_api, "submit_otp", lambda *args, **kwargs: accepted)

    try:
        result = ajyal_api.auth_otp(session_id, ajyal_api.OtpRequest(code="123456"))

        assert result.authenticated is True
        assert result.session_id == session_id
        assert state.authenticated is True
        assert state.pending_otp is False
        assert state.otp_response is None
    finally:
        remove_session(session_id)
