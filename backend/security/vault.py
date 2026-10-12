"""
Secure Credential Vault for 2REAL AI TRADER.
- Never stores trading passwords in plaintext configuration files, browser storage, or source code.
- Uses Operating System Keyring (Windows Credential Locker / macOS Keychain / Freedesktop SecretService)
  when available.
- Provides a fallback AES-256-GCM encrypted vault (PBKDF2-HMAC-SHA256, 600,000 iterations)
  with strict 0600 file permissions for headless/sandbox environments where OS keyring is unavailable.
- Registers any stored password with CredentialRedactingFilter so it can never be logged.
"""
import base64
import json
import os
import secrets
from pathlib import Path
from typing import Any, Dict, Optional

import keyring
from keyring.errors import KeyringError
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from backend.core.logging_config import CredentialRedactingFilter, setup_logging

logger = setup_logging()

SERVICE_NAME = "2REAL_AI_TRADER_MT5_VAULT"
DEFAULT_VAULT_DIR = Path(__file__).resolve().parent.parent / "data"


class SecureCredentialVault:
    """
    Manages MT5 connection credentials securely.
    """

    def __init__(self, vault_dir: Optional[Path] = None, master_passphrase: Optional[str] = None):
        self.vault_dir = Path(vault_dir) if vault_dir else DEFAULT_VAULT_DIR
        self.vault_dir.mkdir(parents=True, exist_ok=True)
        self.vault_file = self.vault_dir / ".mt5_credentials.vault"
        self.key_file = self.vault_dir / ".vault_machine.key"
        self._master_passphrase = master_passphrase
        self._backend_type = self._detect_backend()

    def _detect_backend(self) -> str:
        """Detect if a viable OS keyring backend is available."""
        try:
            kr = keyring.get_keyring()
            kr_name = kr.__class__.__name__.lower()
            if "fail" in kr_name or "null" in kr_name or "chainer" in kr_name:
                # Test probe write/delete
                keyring.set_password(SERVICE_NAME, "__probe__", "ok")
                keyring.delete_password(SERVICE_NAME, "__probe__")
            else:
                keyring.set_password(SERVICE_NAME, "__probe__", "ok")
                keyring.delete_password(SERVICE_NAME, "__probe__")
            return f"OS_KEYRING ({kr.__class__.__name__})"
        except Exception:
            return "AES256_GCM_ENCRYPTED_VAULT"

    def _get_or_create_machine_secret(self) -> bytes:
        """
        Obtain or generate a local 256-bit machine key with 0600 permissions,
        combined with optional operator passphrase.
        """
        if self._master_passphrase:
            return self._master_passphrase.encode("utf-8")
        if self.key_file.exists():
            raw = self.key_file.read_bytes()
            if len(raw) >= 32:
                return raw
        key_bytes = secrets.token_bytes(32)
        self.key_file.write_bytes(key_bytes)
        try:
            os.chmod(self.key_file, 0o600)
        except OSError:
            pass
        return key_bytes

    def _derive_aes_key(self, salt: bytes) -> bytes:
        secret = self._get_or_create_machine_secret()
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=600_000,
        )
        return kdf.derive(secret)

    def store_credentials(
        self,
        broker: str,
        server: str,
        login: int,
        password: str,
        terminal_path: str = "",
        trading_mode: str = "DEMO",
        ea_shared_secret: str = "",
    ) -> Dict[str, Any]:
        """
        Securely store MT5 credentials in OS keyring or AES-256-GCM vault.
        Never writes plaintext passwords to disk or logs.
        """
        if password:
            CredentialRedactingFilter.register_secret(password)
        if ea_shared_secret:
            CredentialRedactingFilter.register_secret(ea_shared_secret)

        payload = {
            "broker": broker.strip(),
            "server": server.strip(),
            "login": int(login),
            "password": password,
            "terminal_path": terminal_path.strip(),
            "trading_mode": trading_mode.upper().strip(),
            "ea_shared_secret": ea_shared_secret or secrets.token_hex(16),
        }
        serialized = json.dumps(payload)

        # Try OS Keyring first if detected
        if self._backend_type.startswith("OS_KEYRING"):
            try:
                keyring.set_password(SERVICE_NAME, "active_mt5_profile", serialized)
                logger.info(
                    "Stored MT5 credentials for login=%s server=%s in %s",
                    login,
                    server,
                    self._backend_type,
                )
                return {
                    "stored": True,
                    "backend": self._backend_type,
                    "masked_password": self.mask_password(password),
                }
            except KeyringError:
                self._backend_type = "AES256_GCM_ENCRYPTED_VAULT"

        # AES-256-GCM encrypted local vault
        salt = secrets.token_bytes(16)
        nonce = secrets.token_bytes(12)
        aes_key = self._derive_aes_key(salt)
        aesgcm = AESGCM(aes_key)
        ciphertext = aesgcm.encrypt(nonce, serialized.encode("utf-8"), associated_data=b"2REAL_MT5_V1")

        envelope = {
            "version": 1,
            "kdf": "PBKDF2-HMAC-SHA256-600000",
            "cipher": "AES-256-GCM",
            "salt": base64.b64encode(salt).decode("ascii"),
            "nonce": base64.b64encode(nonce).decode("ascii"),
            "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
        }
        self.vault_file.write_text(json.dumps(envelope, indent=2), encoding="utf-8")
        try:
            os.chmod(self.vault_file, 0o600)
        except OSError:
            pass

        logger.info(
            "Stored MT5 credentials for login=%s server=%s in AES-256-GCM encrypted vault",
            login,
            server,
        )
        return {
            "stored": True,
            "backend": self._backend_type,
            "masked_password": self.mask_password(password),
        }

    def load_credentials(self) -> Optional[Dict[str, Any]]:
        """
        Retrieve decrypted credentials in memory only.
        Returns None if no credentials are saved.
        """
        if self._backend_type.startswith("OS_KEYRING"):
            try:
                raw = keyring.get_password(SERVICE_NAME, "active_mt5_profile")
                if raw:
                    data = json.loads(raw)
                    if data.get("password"):
                        CredentialRedactingFilter.register_secret(data["password"])
                    return data
            except Exception:
                pass

        if not self.vault_file.exists():
            return None

        try:
            envelope = json.loads(self.vault_file.read_text(encoding="utf-8"))
            salt = base64.b64decode(envelope["salt"])
            nonce = base64.b64decode(envelope["nonce"])
            ciphertext = base64.b64decode(envelope["ciphertext"])
            aes_key = self._derive_aes_key(salt)
            aesgcm = AESGCM(aes_key)
            plaintext = aesgcm.decrypt(nonce, ciphertext, associated_data=b"2REAL_MT5_V1")
            data = json.loads(plaintext.decode("utf-8"))
            if data.get("password"):
                CredentialRedactingFilter.register_secret(data["password"])
            return data
        except Exception as exc:
            logger.error("Failed to decrypt credential vault: %s", type(exc).__name__)
            return None

    def get_public_profile(self) -> Dict[str, Any]:
        """
        Return safe, non-sensitive profile metadata for the UI.
        Password is NEVER included in plaintext; only a boolean `has_password` and masked display.
        """
        creds = self.load_credentials()
        if not creds:
            return {
                "has_saved_credentials": False,
                "vault_backend": self._backend_type,
                "broker": "",
                "server": "",
                "login": None,
                "masked_password": "",
                "terminal_path": "",
                "trading_mode": "DEMO",
            }
        pwd = creds.get("password", "")
        return {
            "has_saved_credentials": True,
            "vault_backend": self._backend_type,
            "broker": creds.get("broker", ""),
            "server": creds.get("server", ""),
            "login": creds.get("login"),
            "masked_password": self.mask_password(pwd),
            "terminal_path": creds.get("terminal_path", ""),
            "trading_mode": creds.get("trading_mode", "DEMO"),
        }

    def forget_credentials(self) -> Dict[str, Any]:
        """
        Securely wipe stored credentials from OS keyring and encrypted local vault.
        """
        if self._backend_type.startswith("OS_KEYRING"):
            try:
                keyring.delete_password(SERVICE_NAME, "active_mt5_profile")
            except Exception:
                pass

        if self.vault_file.exists():
            try:
                # Overwrite with random bytes before unlinking
                size = self.vault_file.stat().st_size
                self.vault_file.write_bytes(secrets.token_bytes(max(size, 64)))
                self.vault_file.unlink()
            except OSError:
                pass

        if self.key_file.exists():
            try:
                self.key_file.write_bytes(secrets.token_bytes(32))
                self.key_file.unlink()
            except OSError:
                pass

        CredentialRedactingFilter.clear_secrets()
        logger.info("All stored MT5 credentials have been wiped from vault.")
        return {"wiped": True, "vault_backend": self._backend_type}

    @staticmethod
    def mask_password(password: str) -> str:
        if not password:
            return ""
        if len(password) <= 4:
            return "*" * len(password)
        return "*" * (len(password) - 2) + password[-2:]
