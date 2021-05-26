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
        page: 'prod' // Page : cart or prod.
    };

    app.enumerate = (a) => {
        // This adds an _idx field to each element of the array.
        let k = 0;
        a.map((e) => {e._idx = k++;});
        return a;
    };

    app.get_products = function () {
        // Gets products in response to page load or query.
        axios.get(products_url, {params: {q: app.vue.product_search}})
            .then(function (r) {
                app.vue.products = app.enumerate(r.data.products);
            });
    };

    app.clear_search = function () {
        app.vue.product_search = "";
        app.get_products();
    };

    app.store_cart = function () {
        // Stores the cart in the local storage.
        localStorage.cart = JSON.stringify(app.vue.cart);
    };

    app.read_cart = function() {
        // Reads cart from local storage.
        if (localStorage.cart) {
            app.vue.cart = JSON.parse(localStorage.cart);
        } else {
            app.vue.cart = [];
        }
        app.update_cart();
    };

    app.inc_desired_quantity = function(product_idx, qty) {
        // Inc and dec to desired quantity.
        let p = app.vue.products[product_idx];
        p.desired_quantity = Math.max(0, p.desired_quantity + qty);
        p.desired_quantity = Math.min(p.quantity, p.desired_quantity);
    };

    app.inc_cart_quantity = function(product_idx, qty) {
        // Inc and dec to desired quantity.
        let p = app.vue.cart[product_idx];
        p.cart_quantity = Math.max(0, p.cart_quantity + qty);
        p.cart_quantity = Math.min(p.quantity, p.cart_quantity);
        app.update_cart();
        app.store_cart();
    };

    app.update_cart = function () {
        app.enumerate(app.vue.cart);
        let cart_size = 0;
        let cart_total = 0;
        for (let c of app.vue.cart) {
            cart_size += c.cart_quantity;
            cart_total += c.cart_quantity * c.price;
        }
        app.vue.cart_size = cart_size;
        app.vue.cart_total = cart_total;
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
                found_idx = i;
            }
        }
        // If it's there, increment the quantity; otherwise, insert it.
        if (already_present) {
            app.vue.cart[found_idx].cart_quantity += p.desired_quantity;
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
        if (page == 'cart') {
            // prepares the form.
            app.stripe_instance = StripeCheckout.configure({
                key: 'pk_test_nj0aqiNoiqmy9UDJUILfP6OU00p6Ehzy2d',    //put your own publishable key here
                image: 'https://stripe.com/img/documentation/checkout/marketplace.png',
                locale: 'auto',
                token: function(token, args) {
                    console.log('got a token. sending data to localhost.');
                    app.stripe_token = token;
                    app.customer_info = args;
                    app.send_data_to_server();
                }
            });
        };

    };

    app.pay = function () {
        app.stripe_instance.open({
            name: "Your nice cart",
            description: "Buy cart content",
            billingAddress: true,
            shippingAddress: true,
            amount: Math.round(app.vue.cart_total * 100),
        });
    };

    app.send_data_to_server = function () {
        console.log("Payment for:", app.customer_info);
        // Calls the server.
        axios.post(purchase_url,
            {
                customer_info: JSON.stringify(app.customer_info),
                transaction_token: JSON.stringify(app.stripe_token),
                amount: app.vue.cart_total,
                cart: JSON.stringify(app.vue.cart),
            })
            .then(function (response) {
                if (response.data === "ok") {
                    // The order was successful.
                    app.vue.cart = [];
                    app.update_cart();
                    app.store_cart();
                    app.goto('prod');
                    Q.flash("Payment succeeded");
                } else {
                    Q.flash("Payment declined");
                }
            });
    };

    // This contains all the methods.
    app.methods = {
        get_products: app.get_products,
        inc_desired_quantity: app.inc_desired_quantity,
        inc_cart_quantity: app.inc_cart_quantity,
        buy_product: app.buy_product,
        goto: app.goto,
        do_search: app.get_products,
        clear_search: app.clear_search,
        pay: app.pay,
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
        app.read_cart();
    };

    // Call to the initializer.
    app.init();
};

// This takes the (empty) app object, and initializes it,
// putting all the code i
init(app);
