from __future__ import annotations

import base64
import re
import secrets
import threading
from datetime import date, datetime
from dataclasses import dataclass
from typing import Dict, Literal, Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

BASE_URL = "https://ajyal.moe.gov.jo"
LOGIN_URL = f"{BASE_URL}/emis/Login.aspx"
ATTENDANCE_URL = f"{BASE_URL}/emis/EduWaveSMS/ManageAttendance.aspx?EKME-sZ-qgdJhYZtXdsecQ2=CbAaLvlaYI41"
TIMEOUT = 30
LOGIN_FORM_ID = "LogIn"
LOGIN_POSTBACK_TARGET = "bMtSMB1"
OTP_FIELD = "tbAuthenticationCode"
OTP_BUTTON = "btnAudit"


class AjyalLoginError(RuntimeError):
    pass


@dataclass
class LoginResult:
    authenticated: bool
    response_url: str
    status_code: int
    response: requests.Response


def _aes_cbc_pkcs7_encrypt(plaintext: str, key_text: str, iv_text: str) -> str:
    key = key_text.encode("utf-8")
    iv = iv_text.encode("utf-8")
    if len(key) not in (16, 24, 32):
        raise AjyalLoginError(f"Unexpected AES key length: {len(key)} bytes")
    if len(iv) != 16:
        raise AjyalLoginError(f"Unexpected AES IV length: {len(iv)} bytes")
    padder = padding.PKCS7(algorithms.AES.block_size).padder()
    padded = padder.update(plaintext.encode("utf-8")) + padder.finalize()
    encryptor = Cipher(algorithms.AES(key), modes.CBC(iv)).encryptor()
    ciphertext = encryptor.update(padded) + encryptor.finalize()
    return base64.b64encode(ciphertext).decode("ascii")


def _hidden_login_fields(form: BeautifulSoup) -> Dict[str, str]:
    return {element["name"]: element.get("value", "") for element in form.select("input[type=hidden][name]")}


def _extract_crypto_parameters(form: BeautifulSoup) -> tuple[str, str]:
    button = form.select_one(f"#{LOGIN_POSTBACK_TARGET}")
    if button is None:
        raise AjyalLoginError("Login button was not found")
    match = re.search(r"ValidatePage\(.*?,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)", button.get("onclick", ""), flags=re.DOTALL)
    if not match:
        raise AjyalLoginError("Could not extract the current AES key and IV")
    return match.group(1), match.group(2)


def _looks_authenticated(response: requests.Response) -> bool:
    if response.url.rstrip("/").lower() != LOGIN_URL.rstrip("/").lower():
        return True
    soup = BeautifulSoup(response.text, "html.parser")
    error = soup.select_one("#lblRes")
    if error and error.get_text(strip=True):
        return False
    return soup.select_one(f"form#{LOGIN_FORM_ID}") is None


def _otp_required(response: requests.Response) -> bool:
    return BeautifulSoup(response.text, "html.parser").select_one(f"input[name={OTP_FIELD}]") is not None


def login(username: str, password: str, *, session: requests.Session, timeout: float = TIMEOUT) -> LoginResult:
    if not username.strip() or not password:
        raise ValueError("username and password are required")
    session.headers.update({"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "ar,en;q=0.9", "User-Agent": "AjyalAttendanceAPI/1.0"})
    page = session.get(LOGIN_URL, timeout=timeout)
    page.raise_for_status()
    soup = BeautifulSoup(page.text, "html.parser")
    form = soup.find("form", id=LOGIN_FORM_ID)
    if form is None:
        raise AjyalLoginError("Login form was not found")
    key, iv = _extract_crypto_parameters(form)
    data = _hidden_login_fields(form)
    data.update({
        "__EVENTTARGET": LOGIN_POSTBACK_TARGET,
        "__EVENTARGUMENT": "",
        "tMbPAN1": username.strip(),
        "tMbPAR1": _aes_cbc_pkcs7_encrypt(password, key, iv),
        "hdnLanguage": form.select_one("#hdnLanguage").get("value", "1") if form.select_one("#hdnLanguage") else "1",
        "hdnCKey": form.select_one("#hdnCKey").get("value", "") if form.select_one("#hdnCKey") else "",
        "hdnCValue": form.select_one("#hdnCValue").get("value", "") if form.select_one("#hdnCValue") else "",
    })
    action = urljoin(LOGIN_URL, form.get("action") or LOGIN_URL)
    response = session.post(action, data=data, headers={"Origin": BASE_URL, "Referer": LOGIN_URL}, timeout=timeout, allow_redirects=True)
    response.raise_for_status()
    return LoginResult(_looks_authenticated(response), response.url, response.status_code, response)


def submit_otp(session: requests.Session, otp_response: requests.Response, code: str, *, timeout: float = TIMEOUT) -> LoginResult:
    if not re.fullmatch(r"\d{6}", code.strip()):
        raise ValueError("The verification code must contain exactly 6 digits")
    soup = BeautifulSoup(otp_response.text, "html.parser")
    form = soup.find("form", id=LOGIN_FORM_ID)
    if form is None:
        raise AjyalLoginError("OTP form was not found")
    data = _hidden_login_fields(form)
    button = form.select_one(f"[name={OTP_BUTTON}]")
    if button is None:
        raise AjyalLoginError("OTP submit control was not found")
    data.update({"__EVENTTARGET": "", "__EVENTARGUMENT": "", OTP_FIELD: code.strip(), OTP_BUTTON: button.get("value", "تدقيق")})
    action = urljoin(LOGIN_URL, form.get("action") or LOGIN_URL)
    response = session.post(action, data=data, headers={"Origin": BASE_URL, "Referer": LOGIN_URL}, timeout=timeout, allow_redirects=True)
    response.raise_for_status()
    return LoginResult(_looks_authenticated(response), response.url, response.status_code, response)


def form_for(soup: BeautifulSoup):
    form = soup.find("form")
    if not form:
        raise RuntimeError("Attendance form was not found")
    return form


def form_data(form) -> Dict[str, str]:
    data: Dict[str, str] = {}
    for element in form.select("input[name], select[name], textarea[name]"):
        name = element.get("name")
        if not name:
            continue
        if element.name == "input":
            kind = element.get("type", "text").lower()
            if kind in {"submit", "button", "image", "file"}:
                continue
            if kind in {"checkbox", "radio"} and not element.has_attr("checked"):
                continue
            data[name] = element.get("value", "on")
        elif element.name == "select":
            option = element.select_one("option[selected]") or element.select_one("option")
            data[name] = option.get("value", "") if option else ""
        else:
            data[name] = element.get_text()
    return data


def parse_page(response: requests.Response) -> BeautifulSoup:
    soup = BeautifulSoup(response.text, "html.parser")
    if soup.select_one("#tMbPAN1") or "login.aspx" in response.url.lower():
        raise RuntimeError("The Ajyal session expired; authenticate again")
    return soup


def merge_async_response(soup: BeautifulSoup, body: str) -> BeautifulSoup:
    for name, value in re.findall(r"(?:^|\|)hiddenField\|([^|]+)\|([^|]*)", body):
        element = soup.find("input", attrs={"name": name})
        if element is None:
            element = soup.new_tag("input", attrs={"type": "hidden", "name": name})
            soup.form.append(element)
        element["value"] = value
    for match in re.finditer(r"(?:^|\|)updatePanel\|([^|]+)\|(\d+)\|", body):
        panel_id = match.group(1)
        length = int(match.group(2))
        fragment_soup = BeautifulSoup(body[match.end():match.end() + length], "html.parser")
        existing = soup.find(id=panel_id)
        replacement = fragment_soup.find(id=panel_id)
        if existing is not None and replacement is not None:
            existing.replace_with(replacement)
            continue
        for element in fragment_soup.find_all(["select", "input", "textarea"]):
            name = element.get("name")
            current = soup.find(id=element.get("id")) if element.get("id") else None
            if current is None and name:
                current = soup.find(attrs={"name": name})
            if current is not None:
                current.replace_with(element)
    return soup


def async_source_for(target: str) -> str:
    sources = {
        "ddlClass": "ctl00$PlaceHolderMain$oDistributionSearch$oClassUpdatePanel",
        "ddlSection": "ctl00$PlaceHolderMain$oDistributionSearch$oSectionUpdatePanel",
        "ddlMowadaba": "ctl00$PlaceHolderMain$UpdatePanelMain",
        "ddlStudents": "ctl00$PlaceHolderMain$UpdatePanel14",
    }
    return sources.get(target.rsplit("$", 1)[-1], "")


def post_step(session: requests.Session, soup: BeautifulSoup, values: Dict[str, str], target: str, async_post: bool = False) -> BeautifulSoup:
    form = form_for(soup)
    data = form_data(form)
    data.update(values)
    data["__EVENTTARGET"] = target
    data["__EVENTARGUMENT"] = ""
    if async_post:
        script_name = next((name for name in data if name.endswith("oScriptManager")), "ctl00$oScriptManager")
        source = async_source_for(target)
        data[script_name] = f"{source}|{target}" if source else target
        data["__ASYNCPOST"] = "true"
    action = urljoin(ATTENDANCE_URL, form.get("action") or ATTENDANCE_URL)
    response = session.post(
        action,
        data=data,
        headers={
            "Origin": BASE_URL,
            "Referer": ATTENDANCE_URL,
            "X-Requested-With": "XMLHttpRequest" if async_post else "",
            "X-MicrosoftAjax": "Delta=true" if async_post else "",
        },
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    return merge_async_response(soup, response.text) if async_post else parse_page(response)


def refresh(session: requests.Session) -> BeautifulSoup:
    response = session.get(ATTENDANCE_URL, timeout=TIMEOUT)
    response.raise_for_status()
    return parse_page(response)


def submit_search(session: requests.Session, soup: BeautifulSoup, values: Dict[str, str]) -> BeautifulSoup:
    form = form_for(soup)
    data = form_data(form)
    data.update(values)
    button = next((element for element in form.select("input[name],button[name]") if element.get("name", "").endswith("ibtnSearch")), None)
    if button:
        data[button["name"]] = button.get("value", "ابحث")
    data["__EVENTTARGET"] = ""
    data["__EVENTARGUMENT"] = ""
    action = urljoin(ATTENDANCE_URL, form.get("action") or ATTENDANCE_URL)
    response = session.post(action, data=data, headers={"Origin": BASE_URL, "Referer": ATTENDANCE_URL}, timeout=TIMEOUT)
    response.raise_for_status()
    return parse_page(response)


def student_rows(soup: BeautifulSoup) -> list[tuple[str, str, str, list[tuple[str, str]]]]:
    rows = []
    for checkbox in soup.select('input[type="checkbox"][name*="gvClassStudentsAttendance"][name$="cbItem"]'):
        row = checkbox.find_parent("tr")
        text = row.get_text(" ", strip=True) if row else checkbox["name"]
        select = row.find("select", attrs={"name": re.compile(r"ddlDegreeDeductAmount$")}) if row else None
        options = []
        if select:
            options = [(option.get("value", ""), option.get_text(" ", strip=True)) for option in select.find_all("option")]
        rows.append((checkbox["name"], text, select.get("name") if select else "", options))
    return rows


app = FastAPI(
    title="Ajyal Attendance API",
    version="1.0.0",
    description="A typed API for Ajyal login, attendance selection, student listing, and confirmed saving.",
)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=25)
    password: str = Field(min_length=1)


class OtpRequest(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


class Option(BaseModel):
    id: str
    label: str


class LoginResponse(BaseModel):
    session_id: str
    authenticated: bool
    requires_otp: bool = False
    message: str


class SelectionRequest(BaseModel):
    class_id: str
    specialty_id: Optional[str] = None
    section_id: str


class AttendanceTypeRequest(BaseModel):
    attendance_type_id: str
    attendance_date: date


class StudentFilterRequest(BaseModel):
    violation_id: str = "-99"


class Student(BaseModel):
    id: int
    name: str
    checkbox_name: str
    status_options: list[Option]


class AttendanceRecord(BaseModel):
    student_id: int = Field(ge=1)
    status: Literal["present", "excused_absence", "unexcused_absence"]


class SaveAttendanceRequest(BaseModel):
    records: list[AttendanceRecord] = Field(min_length=1)
    confirm: bool = False


class SessionState:
    def __init__(self, session: requests.Session):
        self.http = session
        self.page: Optional[BeautifulSoup] = None
        self.otp_response: Optional[requests.Response] = None
        self.authenticated = False
        self.pending_otp = False
        self.created_at = datetime.utcnow()
        self.updated_at = self.created_at
        self.lock = threading.RLock()


sessions: Dict[str, SessionState] = {}
sessions_lock = threading.RLock()


def new_session() -> tuple[str, SessionState]:
    session_id = secrets.token_urlsafe(24)
    http = requests.Session()
    http.headers.update(
        {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ar,en;q=0.9",
            "User-Agent": "AjyalAttendanceAPI/1.0",
        }
    )
    state = SessionState(http)
    with sessions_lock:
        sessions[session_id] = state
    return session_id, state


def get_session(session_id: str) -> SessionState:
    with sessions_lock:
        state = sessions.get(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Unknown or expired session_id")
    state.updated_at = datetime.utcnow()
    return state


def options(select) -> list[Option]:
    if not select:
        return []
    result = []
    for element in select.find_all("option"):
        value = element.get("value", "")
        label = element.get_text(" ", strip=True)
        if value not in {"", "-99"}:
            result.append(Option(id=value, label=label))
    return result


def field_name(form, suffix: str) -> Optional[str]:
    for element in form.select("[name]"):
        name = element.get("name", "")
        if name == suffix or name.endswith(suffix):
            return name
    return None


def select_by_suffix(form, suffix: str):
    name = field_name(form, suffix)
    return form.find("select", attrs={"name": name}) if name else None


def require_page(state: SessionState) -> BeautifulSoup:
    if not state.authenticated:
        raise HTTPException(status_code=401, detail="Authenticate first")
    if state.page is None:
        try:
            state.page = refresh(state.http)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Could not load attendance page: {exc}") from exc
    return state.page


def api_step(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Ajyal request failed: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def attendance_options(state: SessionState) -> dict:
    page = require_page(state)
    form = form_for(page)
    return {
        "classes": [Option(id=v, label=t) for v, t in _options(form, "ddlClass")],
        "specialties": [Option(id=v, label=t) for v, t in _options(form, "ddlSpecialty")],
        "sections": [Option(id=v, label=t) for v, t in _options(form, "ddlSection")],
        "attendance_types": [Option(id=v, label=t) for v, t in _options(form, "ddlMowadaba")],
        "violations": [Option(id=v, label=t) for v, t in _options(form, "ddlViolation")],
    }


def _options(form, suffix: str) -> list[tuple[str, str]]:
    select = select_by_suffix(form, suffix)
    return [(option.id, option.label) for option in options(select)]


def validate_choice(value: str, available: list[tuple[str, str]], label: str) -> None:
    if value not in {item[0] for item in available}:
        raise HTTPException(status_code=422, detail=f"Invalid {label} id: {value}")


def students_from_page(page: BeautifulSoup) -> list[Student]:
    result = []
    for index, (checkbox_name, text, _, row_options) in enumerate(student_rows(page), 1):
        result.append(
            Student(
                id=index,
                name=text,
                checkbox_name=checkbox_name,
                status_options=[
                    Option(id=value, label=label)
                    for value, label in row_options
                    if value not in {"", "-99"} and "اختر" not in label and "choose" not in label.lower()
                ],
            )
        )
    return result


def current_rows(page: BeautifulSoup):
    return student_rows(page)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "ajyal-attendance-api"}


@app.post("/auth/login", response_model=LoginResponse)
def auth_login(payload: LoginRequest):
    session_id, state = new_session()
    with state.lock:
        try:
            result = login(payload.username, payload.password, session=state.http, timeout=TIMEOUT)
            if not result.authenticated and _otp_required(result.response):
                state.pending_otp = True
                state.otp_response = result.response
                return LoginResponse(
                    session_id=session_id,
                    authenticated=False,
                    requires_otp=True,
                    message="Enter the six-digit OTP with POST /auth/{session_id}/otp",
                )
            if not result.authenticated:
                raise HTTPException(status_code=401, detail="Ajyal rejected the credentials")
            state.authenticated = True
            return LoginResponse(session_id=session_id, authenticated=True, message="Login succeeded")
        except HTTPException:
            raise
        except requests.RequestException as exc:
            raise HTTPException(status_code=502, detail=f"Ajyal login request failed: {exc}") from exc


@app.post("/auth/{session_id}/otp", response_model=LoginResponse)
def auth_otp(session_id: str, payload: OtpRequest):
    state = get_session(session_id)
    with state.lock:
        if not state.pending_otp:
            raise HTTPException(status_code=409, detail="This session is not waiting for OTP")
        if state.otp_response is None:
            raise HTTPException(status_code=409, detail="The pending OTP form is unavailable; log in again")
        result = api_step(submit_otp, state.http, state.otp_response, payload.code, timeout=TIMEOUT)
        if not result.authenticated:
            raise HTTPException(status_code=401, detail="The OTP was rejected or expired")
        state.pending_otp = False
        state.otp_response = None
        state.authenticated = True
        return LoginResponse(session_id=session_id, authenticated=True, message="OTP accepted; login succeeded")


@app.delete("/auth/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def auth_logout(session_id: str):
    with sessions_lock:
        if session_id not in sessions:
            raise HTTPException(status_code=404, detail="Unknown session_id")
        del sessions[session_id]


@app.get("/attendance/{session_id}/options")
def get_options(session_id: str):
    state = get_session(session_id)
    with state.lock:
        return attendance_options(state)


@app.post("/attendance/{session_id}/class")
def select_class(session_id: str, class_id: str):
    state = get_session(session_id)
    with state.lock:
        page = require_page(state)
        form = form_for(page)
        name = field_name(form, "ddlClass")
        available = _options(form, "ddlClass")
        if not name:
            raise HTTPException(status_code=422, detail="Class control is not available")
        validate_choice(class_id, available, "class")
        state.page = api_step(post_step, state.http, page, {name: class_id}, name, False)
        return attendance_options(state)


@app.post("/attendance/{session_id}/selection")
def select_section(session_id: str, payload: SelectionRequest):
    state = get_session(session_id)
    with state.lock:
        page = require_page(state)
        form = form_for(page)
        section_name = field_name(form, "ddlSection")
        section_choices = _options(form, "ddlSection")
        validate_choice(payload.section_id, section_choices, "section")
        values = {}
        if payload.specialty_id is not None:
            specialty_name = field_name(form, "ddlSpecialty")
            specialty_choices = _options(form, "ddlSpecialty")
            if not specialty_name:
                raise HTTPException(status_code=422, detail="Specialty control is not available")
            validate_choice(payload.specialty_id, specialty_choices, "specialty")
            values[specialty_name] = payload.specialty_id
        if not section_name:
            raise HTTPException(status_code=422, detail="Section control is not available")
        values[section_name] = payload.section_id
        state.page = api_step(post_step, state.http, page, values, section_name, False)
        return attendance_options(state)


@app.post("/attendance/{session_id}/type")
def select_attendance_type(session_id: str, payload: AttendanceTypeRequest):
    state = get_session(session_id)
    with state.lock:
        page = require_page(state)
        form = form_for(page)
        name = field_name(form, "ddlMowadaba")
        available = _options(form, "ddlMowadaba")
        if not name:
            raise HTTPException(status_code=422, detail="Attendance type control is not available")
        validate_choice(payload.attendance_type_id, available, "attendance type")
        values = {name: payload.attendance_type_id}
        date_name = field_name(form, "clrAttendanceDay")
        if date_name:
            values[date_name] = payload.attendance_date.isoformat()
        hidden_date_name = field_name(form, "hdnSelectedAttendanceDate")
        if hidden_date_name:
            values[hidden_date_name] = payload.attendance_date.strftime("%d/%m/%Y")
        state.page = api_step(post_step, state.http, page, values, name, False)
        return attendance_options(state)


@app.post("/attendance/{session_id}/filter")
def select_student_filter(session_id: str, payload: StudentFilterRequest):
    state = get_session(session_id)
    with state.lock:
        page = require_page(state)
        form = form_for(page)
        student_name = field_name(form, "ddlStudents")
        if not student_name:
            raise HTTPException(status_code=422, detail="Student control is not available")
        violation_name = field_name(form, "ddlViolation")
        values = {}
        if violation_name:
            available = _options(form, "ddlViolation")
            if payload.violation_id != "-99":
                validate_choice(payload.violation_id, available, "violation")
            values[violation_name] = payload.violation_id
        values[student_name] = "-99"
        state.page = api_step(post_step, state.http, page, values, student_name, False)
        state.page = api_step(submit_search, state.http, state.page, {})
        return {"students": students_from_page(state.page)}


@app.get("/attendance/{session_id}/students", response_model=list[Student])
def list_students(session_id: str):
    state = get_session(session_id)
    with state.lock:
        return students_from_page(require_page(state))


@app.post("/attendance/{session_id}/save")
def save_attendance(session_id: str, payload: SaveAttendanceRequest):
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="Set confirm=true to save attendance records")
    state = get_session(session_id)
    with state.lock:
        page = require_page(state)
        rows = current_rows(page)
        if not rows:
            raise HTTPException(status_code=422, detail="No students are loaded; run the filter step first")
        by_id = {index: row for index, row in enumerate(rows, 1)}
        form = form_for(page)
        data = form_data(form)
        for checkbox_name, _, select_name, _ in rows:
            data.pop(checkbox_name, None)
            data.pop(select_name, None)
        for record in payload.records:
            if record.student_id not in by_id:
                raise HTTPException(status_code=422, detail=f"Unknown student id: {record.student_id}")
            checkbox_name, _, select_name, options_for_student = by_id[record.student_id]
            if record.status == "present":
                continue
            desired = "excused_absence" if record.status == "excused_absence" else "unexcused_absence"
            match = next((value for value, label in options_for_student if ("بعذر" in label) == (desired == "excused_absence") and "بدون" not in label), None)
            if match is None:
                match = next((value for value, label in options_for_student if ("بدون" in label) == (desired == "unexcused_absence")), None)
            if match is None:
                raise HTTPException(status_code=422, detail=f"No matching absence option for student {record.student_id}")
            data[checkbox_name] = "on"
            data[select_name] = match
        agreement = field_name(form, "cbAgreement1")
        if agreement:
            data[agreement] = "on"
        save_button = next((x for x in form.select("input[name],button[name]") if x.get("name", "").endswith("ibtnSave")), None)
        if not save_button:
            raise HTTPException(status_code=422, detail="Save button is not available")
        data[save_button["name"]] = save_button.get("value", "حفظ")
        data["__EVENTTARGET"] = ""
        data["__EVENTARGUMENT"] = ""
        action = urljoin(ATTENDANCE_URL, form.get("action") or ATTENDANCE_URL)
        response = api_step(
            state.http.post,
            action,
            data=data,
            headers={"Origin": BASE_URL, "Referer": ATTENDANCE_URL},
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        state.page = parse_page(response)
        return {"saved": True, "student_ids": [r.student_id for r in payload.records]}
