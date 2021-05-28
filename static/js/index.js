// This will be the object that will contain the Vue attributes
// and be used to initialize it.
let app = {};

// Given an empty app object, initializes it filling its attributes,
// creates a Vue instance, and then initializes the Vue instance.
let init = (app) => {

    // This is the Vue data.
    app.data = {
        products: [], // Products
        cart: [], // Cart
        product_search: '',
        cart_size: 0,
        cart_total: 0,
        page: 'prod', // Page : cart or prod.
        checkout_state: 'checkout', // checkout, then pay.
        fulfillment: {name: "", address: ""}, // This is just an example
    };

    app.stripe_session_id = null;
    app.items = []; // List of items one is checking out.

    app.annotate = (a) => {
        // This adds an _idx field to each element of the array.
        let k = 0;
        a.map((e) => {
            e._idx = k++;
            e.fprice = e.price.toLocaleString(
                undefined, { minimumFractionDigits: 2,
                    maximumFractionDigits: 2 }
            );
        });
        return a;
    };

    app.get_products = function () {
        // Gets products in response to page load or query.
        axios.get(products_url, {params: {q: app.vue.product_search}})
            .then(function (r) {
                app.vue.products = app.annotate(r.data.products);
            });
    };

    app.clear_search = function () {
        app.vue.product_search = "";
        app.get_products();
    };

    app.store_cart = function () {
        // Stores the cart in the local storage.
        localStorage[app_name] = JSON.stringify({cart: app.vue.cart});
    };

    app.read_cart = function() {
        // Reads cart from local storage.
        if (localStorage[app_name]) {
            try {
                app.vue.cart = JSON.parse(localStorage[app_name]).cart;
            } catch (error) {
                console.error(error);
                app.vue.cart = [];
            }
        } else {
            app.vue.cart = [];
        }
        app.update_cart();
    };

    app.inc_desired_quantity = function(product_idx, qty) {
        // Inc and dec to desired quantity.
        let p = app.vue.products[product_idx];
        p.desired_quantity = Math.max(0,
            Math.min(p.quantity, p.desired_quantity + qty));
    };

    app.inc_cart_quantity = function(product_idx, qty) {
        // Inc and dec to desired quantity.
        let p = app.vue.cart[product_idx];
        p.cart_quantity = Math.max(0,
            Math.min(p.quantity, p.cart_quantity + qty));
    };

    app.update_cart = function () {
        app.annotate(app.vue.cart);
        let cart_size = 0;
        let cart_total = 0;
        for (let c of app.vue.cart) {
            cart_size += c.cart_quantity;
            cart_total += c.cart_quantity * c.price;
        }
        app.vue.cart_size = cart_size;
        app.vue.cart_total = (cart_total).toLocaleString(
            undefined, { minimumFractionDigits: 2,
                maximumFractionDigits: 2 }
        );
    };

    app.clear_cart = function () {
        app.vue.cart = [];
        app.update_cart();
        app.store_cart();
        app.goto('prod');
    };

    app.buy_product = function(product_idx) {
        let p = app.vue.products[product_idx];
        // I need to put the product in the cart.
        // Check if it is already there.
        let already_present = false;
        let found_idx = 0;
        for (let c of app.vue.cart) {
            if (c.id === p.id) {
                already_present = true;
                found_idx = c._idx;
            }
        }
        // If it's there, increment the quantity; otherwise, insert it.
        if (already_present) {
            let cp = app.vue.cart[found_idx];
            cp.cart_quantity = Math.max(0,
                Math.min(p.quantity, cp.cart_quantity + p.cart_quantity));
        } else {
            p.cart_quantity = p.desired_quantity;
            app.vue.cart.push(p);
        }
        // Updates the amount of products in the cart.
        app.update_cart();
        app.store_cart();
    };

    app.customer_info = {};

    app.goto = function (page) {
        app.vue.page = page;
    };

    app.checkout = function () {
        // Checkout is the first stage: we check that the products
        // are still available, and we ask for fulfillment info
        // (address, etc).  One then clicks Pay to pay.
        app.items = [];
        for (let p of app.vue.cart) {
            app.items.push({
                product_id: p.id,
                quantity: p.cart_quantity,
            });
        }
        axios.post(checkout_url, {items: app.items})
            .then(function (r) {
                if (r.data.ok) {
                    // The server says: ok, the transaction can be performed.
                    app.vue.checkout_state = "pay";
                } else {
                    // The server says: nope.  Not enough stock.
                    // Here, you should do something more sophisticated.
                    // For instance, have the server suggest what less to
                    // get, or substitutions.  We leave this up to you.
                    // For the moment, we just clear the cart.
                    app.vue.get_products();
                    app.vue.cart = [];
                    app.vue.update_cart();
                    app.vue.store_cart();
                    Q.flash("I am sorry, somebody else bought it before you did.")
                }
            });
    };

    app.pay = function () {
        // When one clicks pay, this contacts the server, to store the fulfillment
        // information and get a Stripe session id, and then redirects to Stripe.
        axios.post(pay_url, {
            items: app.items,
            fulfillment: app.vue.fulfillment
        }).then(function (r) {
            if (r.data.ok) {
                // The server says: ok, the transaction can be performed.
                let stripe_session_id = r.data.session_id;
                app.vue.checkout_state = "pay";
                stripe = Stripe(stripe_key);
                stripe.redirectToCheckout({
                    sessionId: stripe_session_id,
                }).then(function (result) {
                    Q.flash(result.error.message);
                });
            } else {
                // The server says: nope.  See above.
                app.vue.get_products();
                app.vue.cart = [];
                app.vue.update_cart();
                app.vue.store_cart();
                Q.flash("I am sorry, somebody else bought it before you did.")
            }
        });
    };


    // This contains all the methods.
    app.methods = {
        get_products: app.get_products,
        inc_desired_quantity: app.inc_desired_quantity,
        inc_cart_quantity: app.inc_cart_quantity,
        goto: app.goto,
        buy_product: app.buy_product,
        do_search: app.get_products,
        clear_search: app.clear_search,
        clear_cart: app.clear_cart,
        pay: app.pay,
        checkout: app.checkout,
    };

    // This creates the Vue instance.
    app.vue = new Vue({
        el: "#vue-target",
        data: app.data,
        methods: app.methods
    });

    // And this initializes it.
    app.init = () => {
        // Load the products...
        app.vue.get_products();
        // .. and the cart.
        if (clear_cart) {
            console.log("clearing the cart");
            app.vue.cart = [];
            app.update_cart();
            app.store_cart();
        } else {
            app.read_cart();
        }
    };

    // Call to the initializer.
    app.init();
};

// This takes the (empty) app object, and initializes it,
// putting all the code i
init(app);
