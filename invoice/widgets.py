import json
from django import forms


class IndentedJSONWidget(forms.Textarea):
    """Reusable JSON widget with auto indentation"""

    def __init__(self, attrs=None, default=dict):
        self.default = default
        super().__init__(attrs={
            "rows": 20,
            "cols": 120,
            "style": (
                "font-family: ui-monospace, Consolas, monospace; "
                "font-size: 13px;"
            ),
            **(attrs or {})
        })

    def format_value(self, value):

        if value in (None, "", {}):
            value = self.default() if callable(self.default) else self.default

        if isinstance(value, str):
            try:
                value = json.loads(value)
            except Exception:
                return value

        try:
            return json.dumps(value, indent=2, ensure_ascii=False)
        except Exception:
            return str(value)
