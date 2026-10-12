"""
Secure logging configuration for 2REAL AI TRADER.
Ensures trading passwords, tokens, and secrets are NEVER printed to logs.
"""
import logging
import re
from typing import Set


class CredentialRedactingFilter(logging.Filter):
    """
    Filter that intercepts all log records and scrubs any registered sensitive
    strings (such as MT5 trading passwords or session tokens) as well as
    regex patterns matching password fields.
    """

    _registered_secrets: Set[str] = set()
    _patterns = [
        re.compile(r'("password"\s*:\s*")([^"]+)(")', re.IGNORECASE),
        re.compile(r"('password'\s*:\s*')([^']+)(')", re.IGNORECASE),
        re.compile(r"(password\s*=\s*)([^\s,;]+)", re.IGNORECASE),
        re.compile(r"(mt5_password\s*=\s*)([^\s,;]+)", re.IGNORECASE),
        re.compile(r"(secret\s*=\s*)([^\s,;]+)", re.IGNORECASE),
    ]

    @classmethod
    def register_secret(cls, secret: str) -> None:
        if secret and len(secret.strip()) >= 3:
            cls._registered_secrets.add(secret)
            cls._registered_secrets.add(secret.strip())

    @classmethod
    def clear_secrets(cls) -> None:
        cls._registered_secrets.clear()

    @classmethod
    def sanitize_text(cls, text: str) -> str:
        if not isinstance(text, str):
            text = str(text)
        for secret in list(cls._registered_secrets):
            if secret and secret in text:
                text = text.replace(secret, "[REDACTED_SECRET]")
        for pattern in cls._patterns:
            text = pattern.sub(r"\1[REDACTED]\3" if pattern.groups == 3 else r"\1[REDACTED]", text)
        return text

    def filter(self, record: logging.LogRecord) -> bool:
        if record.msg:
            record.msg = self.sanitize_text(str(record.msg))
        if record.args:
            if isinstance(record.args, dict):
                record.args = {
                    k: (
                        "[REDACTED]"
                        if "pass" in str(k).lower()
                        else (self.sanitize_text(v) if isinstance(v, str) else v)
                    )
                    for k, v in record.args.items()
                }
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    self.sanitize_text(a) if isinstance(a, str) else a
                    for a in record.args
                )
        return True


def setup_logging(level: int = logging.INFO) -> logging.Logger:
    logger = logging.getLogger("2real")
    logger.setLevel(level)
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        handler.addFilter(CredentialRedactingFilter())
        logger.addHandler(handler)
    # Attach filter to root logger as well for safety
    root_logger = logging.getLogger()
    if not any(isinstance(f, CredentialRedactingFilter) for f in root_logger.filters):
        root_logger.addFilter(CredentialRedactingFilter())
    return logger
