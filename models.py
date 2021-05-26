"""
This file defines the database models
"""

import datetime
from .common import db, Field, auth
from pydal.validators import *


def get_user_email():
    return auth.current_user.get('email') if auth.current_user else None

def get_time():
    return datetime.datetime.utcnow()

# Product table.
db.define_table('product',
    Field('product_name'),
    Field('quantity', 'integer'),
    Field('price', 'float'),
    Field('image', 'text'), # Data URL for the image.
    Field('description', 'text'),
)
db.product.id.readable = db.product.id.writable = False

db.define_table('customer_order',
    Field('order_date', default=get_time),
    Field('ordered_items', 'text'), # Json for simplicity
    Field('paid', 'boolean', default=False),
)

db.commit()
