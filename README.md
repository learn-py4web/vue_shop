# Simple Shop

This is an implementation of a simple shop, which uses the Stripe API for 
charging customers.  You need to install the Stripe module: 

    pip install stripe

Customers can complete purchases without logging in; their shopping cart is 
stored in local storage. 

Please have a look at the [Stripe API reference](https://stripe.com/docs/api). 

You need to obtain Stripe keys, and put the test key in `private/stripe_keys.
json`. 

You also need to install the requirements, and primarily, the stripe module. 
