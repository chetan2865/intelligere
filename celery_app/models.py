from django.db import models
from django.utils.timezone import now
from tallyapp.models import companydata


class recPay(models.Model):
    user_email = models.CharField(max_length=60, null=True, blank=True)
    company = models.ForeignKey(companydata, on_delete=models.CASCADE, blank=True, null=True)
    rec_data = models.JSONField(null=True, blank=True, default=dict)
    pay_data = models.JSONField(null=True, blank=True, default=dict)
    credit_note_data = models.JSONField(null=True, blank=True, default=dict)
    debit_note_data = models.JSONField(null=True, blank=True, default=dict)
    received = models.JSONField(null=True, blank=True, default=dict)
    paid = models.JSONField(null=True, blank=True, default=dict)
    timestamp = models.DateTimeField(null=True, blank=True, default=now)
    partial_paid = models.JSONField(null=True, blank=True, default=dict)
    partial_received = models.JSONField(null=True, blank=True, default=dict)
    openingBalance = models.JSONField(default=list, blank=True, null=True)
    max_voucher_no = models.CharField(max_length=20, default=0)
    bank_entry_data = models.JSONField(null=True, blank=True, default=dict)
    distribution_entry_data = models.JSONField(null=True, blank=True, default=dict)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user_email', 'company'], name='unique_user_company')
        ]

    def __str__(self):
        return f"{self.company} - {self.user_email}"
