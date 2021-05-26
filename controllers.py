"""
This file defines actions, i.e. functions the URLs are mapped into
The @action(path) decorator exposed the function at URL:

    http://127.0.0.1:8000/{app_name}/{path}

If app_name == '_default' then simply

    http://127.0.0.1:8000/{path}

If path == 'index' it can be omitted:

    http://127.0.0.1:8000/

The path follows the bottlepy syntax.

@action.uses('generic.html')  indicates that the action uses the generic.html template
@action.uses(session)         indicates that the action uses the session
@action.uses(db)              indicates that the action uses the db
@action.uses(T)               indicates that the action uses the i18n & pluralization
@action.uses(auth.user)       indicates that the action requires a logged in user
@action.uses(auth)            indicates that the action requires the auth object

session, db, T, auth, and tempates are examples of Fixtures.
Warning: Fixtures MUST be declared with @action.uses({fixtures}) else your app will result in undefined behavior
"""

from functools import reduce
import json
import os
import traceback

from py4web import action, request, abort, redirect, URL
from yatl.helpers import A
from .common import db, session, T, cache, auth, logger, authenticated, unauthenticated, flash
from py4web.utils.url_signer import URLSigner
from py4web.utils.grid import Grid
from .models import get_user_email
from .settings import APP_FOLDER

import stripe

url_signer = URLSigner(session)

def nicefy(b):
    if b is None:
        return 'None'
    obj = json.loads(b)
    s = json.dumps(obj, indent=2)
    return s

# Reads the stripe keys.
with open(os.path.join(APP_FOLDER, 'private', 'stripe_keys.json'), 'r') as f:
    STRIPE_KEY_INFO = json.load(f)
stripe.api_key = STRIPE_KEY_INFO['test_private_key']

@action('index')
@action.uses(db, url_signer, 'index.html')
def index():
    return dict(
        products_url = URL('get_products', signer=url_signer),
        purchase_url = URL('purchase', signer=url_signer),
        clear_cart = request.params.get('clear_cart')
    )

@action('get_products')
@action.uses(db, url_signer.verify())
def get_products():
    """Gets the list of products, possibly in response to a query."""
    t = request.params.get('q')
    if t:
        tt = t.strip()
        q = ((db.product.product_name.contains(tt)) |
             (db.product.description.contains(tt)))
    else:
        q = db.product.id > 0
    # This is a bit simplistic; normally you would return only some of
    # the products... and add pagination... this is up to you to fix.
    products = db(q).select(db.product.ALL).as_list()
    # Fixes some fields, to make it easy on the client side.
    for p in products:
        p['desired_quantity'] = min(1, p['quantity'])
        p['cart_quantity'] = 0
    return dict(
        products=products,
    )

@action('purchase', method="POST")
@action.uses(db, url_signer.verify())
def purchase():
    # See https://stripe.com/docs/payments/checkout/migration#api-products
    items = request.json.get('items')
    total = 0
    for it in items:
        total += it['quantity'] * it['unit_price']
    assert total > 0
    # Insert non-paid order (the customer has not checked out yet).
    order_id = db.customer_order.insert(
        ordered_items=json.dumps(items),
        # TODO: normally one would add also customer information.
    )
    stripe_session = stripe.checkout.Session.create(
      payment_method_types=['card'],
      line_items=[{
        'price_data': {
          'product': 'Thank you for your purchase',
          'unit_amount': total,
          'currency': 'usd',
        },
        'quantity': 1,
      }],
      mode='payment',
      success_url=URL('successful_payment', order_id, signer=url_signer),
      cancel_url=URL('cancelled_payment', order_id, signer=url_signer),
    )
    return dict(session_id=stripe_session.id)

@action('successful_payment/<order_id:int>')
@action.uses(url_signer.verify())
def successful_payment(order_id=None):
    order = db(db.customer_order.id == int(order_id)).select().first()
    if order is None:
        redirect(URL('index'))
    order.paid = True
    order.update_record()
    redirect(URL('index', vars=dict(clear_cart='y')))

@action('cancelled_payment/<order_id:int>')
@action.uses(url_signer.verify())
def cancelled_payment(order_id=None):
    try:
        db(db.customer_order.id == int(order_id)).delete()
    except:
        pass
    redirect(URL('index'))

@action('view_orders', method=['POST', 'GET'])
@action('view_orders/<path:path>', method=['POST', 'GET'])
@action.uses(db, auth, session, 'view_orders.html')
def view_orders(path=None):
    """In a realistic example, here you should check that the person is
        authorized to view the orders."""
    grid = Grid(path,
                query=reduce(lambda a, b: (a & b), [db.customer_order.id > 0]),
                orderby=[db.customer_order.id],
                )
    return dict(grid=grid)

@action('manage_products')
@action.uses(db, url_signer, 'manage_products.html')
def manage_products():
    return dict(
        # This is the signed URL for the callback.
        load_url = URL('load_products', signer=url_signer),
        add_url = URL('add_product', signer=url_signer),
        delete_url = URL('delete_product', signer=url_signer),
        edit_url = URL('edit_product', signer=url_signer),
        upload_url = URL('upload_image', signer=url_signer),
    )

# This is our very first API function.
@action('load_products')
@action.uses(url_signer.verify(), db)
def load_products():
    rows = db(db.product).select().as_list()
    return dict(rows=rows)

@action('add_product', method="POST")
@action.uses(url_signer.verify(), db)
def add_product():
    id = db.product.insert(
        product_name=request.json.get('product_name'),
        quantity=request.json.get('quantity'),
        price=request.json.get('price'),
        description=request.json.get('description'),
    )
    return dict(id=id)

@action('delete_product')
@action.uses(url_signer.verify(), db)
def delete_product():
    id = request.params.get('id')
    assert id is not None
    db(db.product.id == id).delete()
    return "ok"

@action('edit_product', method="POST")
@action.uses(url_signer.verify(), db)
def edit_product():
    id = request.json.get("id")
    field = request.json.get("field")
    value = request.json.get("value")
    db(db.product.id == id).update(**{field: value})
    return "ok"

@action('upload_image', method="POST")
@action.uses(url_signer.verify(), db)
def upload_image():
    product_id = request.json.get("product_id")
    image = request.json.get("image")
    db(db.product.id == product_id).update(image=image)
    return "ok"


