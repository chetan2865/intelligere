"""Seed a self-contained demo company ("Chat Trial") on the live Postgres
backend so every module in this app can be exercised end to end.

It writes to the REAL Intelligere backend (the router sends these models to
Postgres), so it is deliberately narrow and safe:

  * It only ever creates/deletes rows tied to comp_name == COMPANY_NAME.
  * Everything runs in one transaction on the backend DB.
  * It is idempotent — re-running wipes the previous "Chat Trial" data first.

    python manage.py seed_chat_trial            # (re)create the demo company
    python manage.py seed_chat_trial --delete   # remove it and stop

The data is cross-linked on purpose: the same party names appear in the
receivable/payable data, the bank entries, the orders and the invoices, and the
same product names appear in inventory and in the sales lines, so the numbers
tie out across modules.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from tallyapp.models import companydata, GroupList, ladgernamedata
from celery_app.models import recPay
from invoice.models import Invoice, InvoiceData
from inventory_management.models import CompanyCredentials, Warehouse, Product, ExpiryProduct

COMPANY_NAME = "Chat Trial"
DEAD_STOCK_DAYS = 90

CUSTOMERS = ["Alpha Retailers", "Beta Traders", "Gamma Stores"]
SUPPLIERS = ["Omega Supplies", "Delta Components"]


class Command(BaseCommand):
    help = "Create (or delete) the 'Chat Trial' demo company on the backend."

    def add_arguments(self, parser):
        parser.add_argument("--delete", action="store_true",
                            help="Only remove the demo company, then exit.")

    def handle(self, *args, **opts):
        with transaction.atomic(using="default"):
            removed = self._clear()
            if opts["delete"]:
                self.stdout.write(self.style.SUCCESS(
                    f"Deleted {removed} existing 'Chat Trial' company(ies)."))
                return
            company = self._create()
        self.stdout.write(self.style.SUCCESS(
            f"\nSeeded '{COMPANY_NAME}' (company_id={company.id}). "
            f"Pick it in the company selector to test every module."))

    # ------------------------------------------------------------------ delete
    def _clear(self):
        existing = list(companydata.objects.filter(comp_name=COMPANY_NAME))
        for company in existing:
            cid = str(company.id)
            # Invoice -> InvoiceData cascades via the real FK.
            Invoice.objects.filter(Seller_data=cid).delete()
            Product.objects.filter(company=COMPANY_NAME).delete()
            ExpiryProduct.objects.filter(company=COMPANY_NAME).delete()
            Warehouse.objects.filter(company=COMPANY_NAME).delete()
            # companydata delete cascades recPay, ladgernamedata, GroupList,
            # CompanyCredentials.
            company.delete()
        return len(existing)

    # ------------------------------------------------------------------ create
    def _create(self):
        today = timezone.localdate()
        now = timezone.now()
        week_end = today - timedelta(days=today.weekday()) + timedelta(days=6)

        overdue = (today - timedelta(days=30)).isoformat()
        overdue_bill = (today - timedelta(days=60)).isoformat()
        this_week = week_end.isoformat()
        upcoming = (today + timedelta(days=40)).isoformat()
        recent_bill = (today - timedelta(days=8)).isoformat()

        company = companydata.objects.create(
            user_company=COMPANY_NAME, comp_name=COMPANY_NAME,
            comp_email="chattrial@intelligere.test", comp_phone="9000000000",
            comp_address="Paldi, Ahmedabad", comp_state="Gujarat",
            comp_gstin="24AAAAA0000A1Z5", state_code=24, pincode="380007",
            is_active=True, is_paid=True, inventory=True,
        )

        CompanyCredentials.objects.create(
            company=company, deadStock=DEAD_STOCK_DAYS, is_negative=True,
            industry_type="Textile", businessType="Trading",
        )

        group_cust = GroupList.objects.create(company=company, group_name="Sundry Debtors")
        group_supp = GroupList.objects.create(company=company, group_name="Sundry Creditors")
        for i, name in enumerate(CUSTOMERS):
            ladgernamedata.objects.create(
                company=company, ledeger_group=group_cust, ledeger_name=name,
                ledeger_gstin=f"24CUST{i:04d}A1Z5", ledeger_phone=f"98765{i:05d}",
                ledeger_email=f"{name.split()[0].lower()}@cust.test",
                ledeger_state="Gujarat", ledeger_address=f"{name} address, Ahmedabad",
            )
        for i, name in enumerate(SUPPLIERS):
            ladgernamedata.objects.create(
                company=company, ledeger_group=group_supp, ledeger_name=name,
                ledeger_gstin=f"24SUPP{i:04d}A1Z5", ledeger_phone=f"91234{i:05d}",
                ledeger_email=f"{name.split()[0].lower()}@supp.test",
                ledeger_state="Gujarat", ledeger_address=f"{name} address, Surat",
            )

        # ---- recPay: receivables, payables, settlements, bank entries --------
        def inv(no, amount, bill, due):
            return {"invoice_no": no, "amount": amount, "billdate": bill, "duedate": due}

        rec_data = {
            "Alpha Retailers": [
                inv("A-001", 75000, overdue_bill, overdue),      # overdue + high value
                inv("A-002", 12000, recent_bill, this_week),     # due this week
            ],
            "Beta Traders": [
                inv("B-001", 30000, recent_bill, upcoming),      # upcoming
            ],
            "Gamma Stores": [
                inv("G-001", 8000, overdue_bill, overdue),       # overdue
                inv("G-000", 5000, overdue_bill, overdue),       # settled (see received)
            ],
        }
        pay_data = {
            "Omega Supplies": [
                inv("O-001", 60000, overdue_bill, overdue),      # overdue + high value
                inv("O-002", 15000, recent_bill, this_week),     # due this week
            ],
            "Delta Components": [
                inv("D-001", 22000, recent_bill, upcoming),      # upcoming
                inv("D-000", 5000, overdue_bill, overdue),       # settled (see paid)
            ],
        }

        def bank(name, vtype, amount):
            debit = amount if vtype == "Payment" else 0.0
            credit = amount if vtype == "Receipt" else 0.0
            return {
                "ledger_name": name, "particular": "HDFC BANK",
                "vouchertype": vtype, "debit": debit, "credit": credit,
                "date": today.strftime("%d-%m-%Y"),
                "narration": f"{vtype} via bank", "is_verified": True,
            }

        bank_entry_data = {
            "Alpha Retailers": [bank("Alpha Retailers", "Receipt", 25000)],
            "Beta Traders": [bank("Beta Traders", "Receipt", 10000)],
            "Omega Supplies": [bank("Omega Supplies", "Payment", 20000)],
            "Delta Components": [bank("Delta Components", "Payment", 5000)],
            # Contra bank/cash account — present in bank data but NOT in rec/pay
            # data, so the Bank Statement intersection filter should drop it.
            "HDFC BANK": [{
                "ledger_name": "HDFC BANK", "particular": "Cash",
                "vouchertype": "Payment", "debit": 14000, "credit": 0.0,
                "date": today.strftime("%d-%m-%Y"), "narration": "ATM withdrawal",
            }],
        }

        recPay.objects.create(
            company=company, user_email="chattrial@intelligere.test",
            rec_data=rec_data, pay_data=pay_data,
            received={"Gamma Stores": ["G-000"]},
            paid={"Delta Components": ["D-000"]},
            partial_received={"Alpha Retailers": [{"invoice_no": "A-001", "amount": 25000}]},
            partial_paid={"Omega Supplies": [{"invoice_no": "O-001", "amount": 20000}]},
            bank_entry_data=bank_entry_data,
        )

        # ---- Invoices & orders ----------------------------------------------
        cid = str(company.id)

        def make_invoice(doc_type, no, party_name, total, date, is_order=False):
            rj = {"Buyer_data_name": party_name, "Seller_data_name": company.comp_name}
            if doc_type == "Purchase Invoice":
                rj = {"Buyer_data_name": company.comp_name, "Seller_data_name": party_name}
            kwargs = dict(
                Seller_data=cid, doc_type=doc_type, Total=float(total),
                response_json=rj, created_by="chattrial@intelligere.test",
            )
            if is_order:
                kwargs.update(doc_no=no, doc_date=date)
            else:
                kwargs.update(Invoice_no=no, Invoice_date=date)
            return Invoice.objects.create(**kwargs)

        def make_line(parent, doc_type, party, product, qty, amount,
                      cgst=0.0, sgst=0.0, igst=0.0):
            InvoiceData.objects.create(
                Invoice_data=parent, doc_type=doc_type,
                Seller_data=company.comp_name, Buyer_data=party,
                Products=product, quantity=float(qty), Amount=float(amount),
                CGST=9.0 if cgst else (0.0), SGST=9.0 if sgst else 0.0,
                IGST=18.0 if igst else 0.0,
                product_cgst_amount=float(cgst), product_sgst_amount=float(sgst),
                product_igst_amount=float(igst),
            )

        # Sales invoices (doc_type 'Invoice') -> Invoices>Total Sales + movement
        inv1 = make_invoice("Invoice", "INV-001", "Alpha Retailers", 168000, recent_bill)
        make_line(inv1, "Invoice", "Alpha Retailers", "Cotton Kurta", 100, 100000, 9000, 9000)
        make_line(inv1, "Invoice", "Alpha Retailers", "Silk Saree", 20, 50000, 4500, 4500)

        inv2 = make_invoice("Invoice", "INV-002", "Beta Traders", 114000, recent_bill)
        make_line(inv2, "Invoice", "Beta Traders", "Denim Jeans", 60, 60000, igst=10800)
        make_line(inv2, "Invoice", "Beta Traders", "Cotton Kurta", 40, 40000, 3600, 3600)

        inv3 = make_invoice("Invoice", "INV-003", "Gamma Stores", 21700, recent_bill)
        make_line(inv3, "Invoice", "Gamma Stores", "Wool Sweater", 5, 15000, 1350, 1350)
        # No-GST line: counts for movement but must be EXCLUDED from Invoices totals.
        make_line(inv3, "Invoice", "Gamma Stores", "Linen Shirt", 2, 4000)

        # Purchase invoices (doc_type 'Purchase Invoice') -> Invoices>Total
        # Purchase AND Order Book>Purchase.
        pi1 = make_invoice("Purchase Invoice", "PI-001", "Omega Supplies", 70800, recent_bill)
        make_line(pi1, "Purchase Invoice", "Omega Supplies", "Cotton Fabric", 200, 60000, 5400, 5400)

        pi2 = make_invoice("Purchase Invoice", "PI-002", "Delta Components", 25960, recent_bill)
        make_line(pi2, "Purchase Invoice", "Delta Components", "Buttons", 1000, 22000, igst=3960)

        # Sales orders (doc_type 'Sales Order') -> Order Book>Sales
        make_invoice("Sales Order", "SO-001", "Alpha Retailers", 75000, recent_bill, is_order=True)
        make_invoice("Sales Order", "SO-002", "Beta Traders", 40000, recent_bill, is_order=True)

        # ---- Inventory -------------------------------------------------------
        Warehouse.objects.create(company=COMPANY_NAME, name="Main Warehouse",
                                 warehouse_address="Paldi, Ahmedabad", contact="9000000001",
                                 email="mainwh@chattrial.test", state_name="Gujarat",
                                 contact_person_name="Ravi Shah")
        Warehouse.objects.create(company=COMPANY_NAME, name="Surat Depot",
                                 warehouse_address="Ring Road, Surat", contact="9000000002",
                                 email="suratwh@chattrial.test", state_name="Gujarat",
                                 contact_person_name="Meera Patel")

        def sku(code, qty, wh_qty=None, wh_name="Main Warehouse",
                fabric="Cotton", color="Blue", size="M", is_neg=False):
            return {
                "sku_code": code, "Quantity": str(qty), "original_qty": str(qty),
                "full_sku_code": code, "Fabric Type": fabric, "Material": fabric,
                "Color": color, "Size": size, "Pattern": "Solid", "Quality": "Premium",
                "GSM / Count": "180",
                "warehouse": [{
                    "name": wh_name, "qty": str(wh_qty if wh_qty is not None else qty),
                    "warehouse_address": "Paldi, Ahmedabad", "contact": "9000000001",
                    "email": "mainwh@chattrial.test", "contact_person_name": "Ravi Shah",
                    "is_negative": is_neg,
                }],
            }

        def product(item, skus, other=None, created=None):
            Product.objects.create(
                company=COMPANY_NAME, item_name=item, Group="Finished Goods",
                sku=skus, other_details=other or {}, deleted=False,
                created_at=created or now,
            )

        # Overstock: Quantity 500 > Maximum Quantity 100.
        product("Cotton Kurta", [sku("CK-001", 500)],
                other={"Maximum Quantity": "100", "Minimum Quantity": "50"})
        # Low stock: warehouse qty 10 <= Minimum Quantity 50.
        product("Silk Saree", [sku("SS-001", 10, wh_qty=10, fabric="Silk", color="Red")],
                other={"Minimum Quantity": "50"})
        # Dead stock: created well beyond DEAD_STOCK_DAYS ago.
        product("Denim Jeans", [sku("DJ-001", 300, fabric="Denim", color="Indigo")],
                created=now - timedelta(days=200))
        # Negative stock: warehouse qty below zero (company has is_negative on).
        product("Wool Sweater", [sku("WS-001", -5, wh_qty=-5, fabric="Wool", color="Grey")])
        # Plain healthy stock (shows under Warehouse Wise Stock).
        product("Linen Shirt", [sku("LS-001", 200, fabric="Linen", color="White")])

        ExpiryProduct.objects.create(
            company=COMPANY_NAME, item_name="Herbal Cream", Group="Perishable",
            sku=[sku("HC-001", 40, fabric="N/A", color="N/A")],
            other_details={"Amount": "5000"}, deleted=False,
            expiry_date=today - timedelta(days=60),
        )

        return company
