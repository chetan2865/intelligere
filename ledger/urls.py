from django.urls import path

from . import views

app_name = 'ledger'

urlpatterns = [
    path('', views.chat_view, name='chat'),
    path('api/query/', views.query_api, name='query_api'),
    path('api/search-ledger/', views.ledger_search_api, name='ledger_search_api'),
    path('api/ledger-detail/', views.ledger_detail_api, name='ledger_detail_api'),
    path('api/ledger-aging/', views.ledger_aging_api, name='ledger_aging_api'),
    path('api/ledger-transactions/', views.ledger_transactions_api, name='ledger_transactions_api'),
    path('api/order-query/', views.order_query_api, name='order_query_api'),
    path('api/inventory-query/', views.inventory_query_api, name='inventory_query_api'),
    path('api/search-stock-item/', views.stock_item_search_api, name='stock_item_search_api'),
    path('api/export-pdf/', views.export_pdf_api, name='export_pdf_api'),
]
