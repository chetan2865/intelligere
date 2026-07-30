from django.db import models


def get_empty_response_json():
    return {
        "Buyer_data_name": "", "Seller_data_name": "", "Bank_name": "",
        "Allcgst": "","Allsgst": "","Alligst": "",
        "account_ledger": "","narration": "",
        "P_O_no": "","P_O_date": "",
        "Terms_of_payment": "","Reference_no": "", "ref_date" : "",
        "Delivery_vehicle_no": "","Delivery_mode": "","distance": "",
        "Delivery_Note": "","Delivery_Note_Date": "","Dispatch_Doc_No": "",
        "Delivery_Transporter": "","Reason_For_Transportation": "","challan_type":"",
        "LR_RR_No": "","Other_References": "",
        "s_name":"","s_statename": "","s_statecode": "",
        "s_pincode": "","s_address": "","s_gstin": "",
        "shf_name": "","shf_gstin": "","shf_state": "",
        "shf_statecode": "","shf_pincode": "","shf_address": "",
        "discount": "","discount_ledger": "",
        "Packaging": "","Packaging_ledger": "",
        "CGSTPackaging": "","packaging_cgst_amount": "",
        "SGSTPackaging": "","packaging_sgst_amount": "",
        "IGSTPackaging": "","packaging_igst_amount": "",
        "Insurance": "","Insurance_ledger": "",
        "CGSTInsurance": "","Insurance_cgst_amount": "",
        "SGSTInsurance": "","Insurance_sgst_amount": "",
        "IGSTInsurance": "","Insurance_igst_amount": "",
        "Frieght": "","Frieght_ledger": "",
        "CGSTFrieght": "","Frieght_cgst_amount": "",
        "SGSTFrieght": "","Frieght_sgst_amount": "",
        "IGSTFrieght": "","Frieght_igst_amount": "",
        "Others": "","Others_ledger": "",
        "CGSTOthers": "","Others_cgst_amount": "",
        "SGSTOthers": "","Others_sgst_amount": "",
        "IGSTOthers": "","Others_igst_amount": "",
        "Roundoff": "","Roundoff_ledger": "",
        "tcs": "","tcs_ledger": "","tcs_amount": "",
        "tds": "","tds_ledger": "","tds_amount": "",
        "GSTTotal": "","valid_from": "","valid_until": "",
        "platform":"","rcm":"","E_invoice_generated":"","remark":"",
        "valid_up_to":'','EWay_Bill_generated':'', "cancel_ewaybill_date" : "",
        "cancel_einvoice_date" : "","Freight_Terms_of_payment":"","note":"","invoice_F":"","invoice_S":"","invoice_T":"",
        "with_discount":"","selected_value":"","demand_advance":"","received_advance":"","select_from":"",
        "demand_type":"","Percentage":"", "Packaging_Ledger_sac" : '', 'Insurance_Ledger_sac' : '',
        'Frieght_Ledger_sac' : '', 'Others_Ledger_sac' : '',
        "transporter_id":"","supply":"","s_type":"","transaction_type":"","LR_RR_date":"",
        "gstr1_generated" : "" , "matching" : "","page_count":"","pdf_count":0,
    }


def get_empty_payload():
    return {
        "einvoice_payload" : "",
        "ewaybill_payload" : ""
    }


class Invoice(models.Model):
    Seller_data = models.CharField(max_length=100, null=True, blank=True)
    Buyer_data = models.JSONField(default=dict)
    Bank = models.CharField(max_length=100, null=True, blank=True)
    Invoice_no = models.CharField(max_length=20, blank=True, null=True)
    Invoice_date = models.DateField(blank=True, null=True)
    doc_type = models.CharField(max_length=25, blank=True, null=True)
    doc_no = models.CharField(max_length=20, blank=True, null=True)
    doc_date = models.DateField(blank=True, null=True)
    doc_PDF = models.FileField(upload_to='docInvoicePdf/', null=True, blank=True, max_length=600)
    CA_email = models.CharField(max_length=50, null=True, blank=True)
    Invoice_PDF = models.FileField(upload_to='invoicepdf/', null=True, blank=True, max_length=600)
    ewayBill_PDF = models.FileField(upload_to='ewaybillpdf/', null=True, blank=True, max_length=600)
    payment_QR = models.ImageField(upload_to='payment_QR/', null=True, blank=True, max_length=300)
    created_by = models.CharField(max_length=40, null=True, blank=True)
    Invoice_type = models.CharField(max_length=10, null=True, blank=True)
    x_deleted = models.BooleanField(default=False)
    y_deleted = models.BooleanField(default=False)
    upload_type = models.CharField(max_length=30, null=True, blank=True)
    voucher_type = models.CharField(max_length=50, blank=True, null=True)
    IRN = models.CharField(max_length=100, null=True, blank=True)
    IRN_Date = models.DateField(blank=True, null=True)
    ack_no = models.CharField(max_length=20, null=True, blank=True)
    qr_code_image = models.ImageField(upload_to='qr_code/', null=True, blank=True)
    Eway_bill_date = models.DateField(blank=True, null=True)
    ewayBill_no = models.CharField(max_length=100, blank=True, null=True)
    gstr1_ack_no = models.CharField(max_length=25, blank=True, null=True)
    Total = models.FloatField(null=True, blank=True, default=0.0)
    response_json = models.JSONField(null=True, blank=True, default=get_empty_response_json)
    reference_from = models.JSONField(null=True, blank=True, default=dict)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    past_tally_invoice = models.BooleanField(default=False)
    uploaded_file = models.BooleanField(default=False)
    sameAsSeller = models.BooleanField(default=True)
    sameAsBuyer = models.BooleanField(default=True)
    alankit_payload = models.JSONField(null=True, blank=True, default=get_empty_payload)

    def __str__(self):
        if self.doc_type == "Invoice" and self.Invoice_no:
            return self.Invoice_no
        elif self.doc_type == "Purchase Invoice" and self.Invoice_no:
            return self.Invoice_no
        elif self.doc_no:
            return self.doc_no
        return "Unnamed Invoice"

    @property
    def invoicedatas(self):
        return self.invoicedata_set.all()

    def save(self, *args, **kwargs):
        if not self.doc_type and self.response_json.get("platform") == "app":
            self.doc_type = "Invoice"
        super().save(*args, **kwargs)


class InvoiceData(models.Model):
    Invoice_data = models.ForeignKey(Invoice, on_delete=models.CASCADE)
    Seller_data = models.CharField(max_length=100, null=True, blank=True)
    Buyer_data = models.CharField(max_length=100, null=True, blank=True)
    Products = models.TextField(null=True, blank=True)
    Invoice_type = models.CharField(max_length=10, null=True, blank=True)
    Description = models.TextField(max_length=500, null=True, blank=True)
    remain_qty = models.FloatField(null=True, blank=True, default=0.0)
    quantity = models.FloatField(null=True, blank=True, default=0.0)
    Discount = models.FloatField(null=True, blank=True, default=0.0)
    Amount = models.FloatField(null=True, blank=True, default=0.0)
    CGST = models.FloatField(null=True, blank=True, default=0.0)
    SGST = models.FloatField(null=True, blank=True, default=0.0)
    IGST = models.FloatField(null=True, blank=True, default=0.0)
    product_cgst_amount = models.FloatField(null=True, blank=True, default=0.0)
    product_sgst_amount = models.FloatField(null=True, blank=True, default=0.0)
    product_igst_amount = models.FloatField(null=True, blank=True, default=0.0)
    doc_type = models.CharField(max_length=25, blank=True, null=True)
    Hsn_code = models.CharField(max_length=10, blank=True, null=True)
    Rate = models.CharField(max_length=20, blank=True, null=True)
    Per = models.CharField(max_length=40, blank=True, null=True)
    platform = models.CharField(max_length=5, blank=True, null=True)
    created_by = models.CharField(max_length=40, null=True, blank=True)
    past_tally_invoice = models.BooleanField(default=False)
    matching = models.CharField(max_length=10, blank=True, null=True)
    warehouse = models.JSONField(default=list, blank=True, null=True)
    so_remove_qty = models.JSONField(default=list, blank=True, null=True)
    ref_doc_no = models.CharField(max_length=20, blank=True, null=True)
    sku_code = models.CharField(max_length=50, blank=True, null=True)
    sku_details = models.JSONField(null=True, blank=True, default=dict)

    def save(self, *args, **kwargs):
        if not self.doc_type and self.platform == "app":
            self.doc_type = "Invoice"
        super().save(*args, **kwargs)
