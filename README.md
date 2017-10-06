# ember-launch-darkly

This addon wraps the [Launch Darkly](https://launchdarkly.com/) feature flagging service and provides helpers to implement feature flagging in your application

## Installation

```bash
$ ember install ember-launch-darkly
```

## Configuration

ember-launch-darkly can be configured from `config/environment.js` as follows:

```js
module.exports = function(environment) {
  let ENV = {
    launchDarkly: {
      // options
    }
  };

  return ENV
};
```

ember-launch-darkly supports the following configuration options:

### `clientSideId` (required)

The client side ID generated by Launch Darkly which is available in your [account settings page](https://app.launchdarkly.com/settings#/projects). See the Launch Darkly docs for [more information on how the client side ID is used](https://docs.launchdarkly.com/docs/js-sdk-reference#section-initializing-the-client).

### `local`

Specify that you'd like to pull feature flags from your local config instead of remotely from Launch Darkly. This is likely appropriate when running in the `development` environment or an external environment for which you don't have Launch Darkly set up.

This option will also make the launch darkly service available in the browser console so that feature flags can be enabled/disabled manually.

_Default_: `false` in production, `true` in all other environments

### `localFeatureFlags`

A list of initial values for your feature flags. This property is only used when `local: true` to populate the list of feature flags for environments such as local development where it's not desired to store the flags in Launch Darkly.

_Default_: `null`

### `streaming`

Streaming options for the feature flags for which you'd like to subscribe to realtime updates. See the [Streaming Feature Flags section](#streaming-feature-flags) for more detailed info on what the possible options are for streaming flags.

_Default_: `false`

## Content Security Policy

If you have CSP enabled in your ember application, you will need to add Launch Darkly to the `connect-src` like so:

```
// config/environment.js

module.exports = function(environment) {
  let ENV = {
    //snip
    
    contentSecurityPolicy: {
      'connect-src': ['https://*.launchdarkly.com']
    }
    
    //snip
  };
};
```

## Usage

### Initialize

Before being used, Launch Darkly must be initialized. This should happen early so choose an appropriate place to make the call such as an application initializer or the application route.

The `initialize()` function returns a promise that resolves when the Launch Darkly client is ready so Ember will wait until this happens before proceeding.

The user `key` is the only required attribute, see the [Launch Darkly documentation](https://docs.launchdarkly.com/docs/js-sdk-reference#section-users) for the other attributes you can provide.

```js
// /app/application/route.js

import Route from 'ember-route';
import service from 'ember-service/inject';

export default Route.extend({
  launchDarkly: service(),

  model() {
    let user = {
      key: 'aa0ceb',
      anonymous: true
    };

    return this.get('launchDarkly').initialize(user);
  }
});
```

### Identify

If you initialized Launch Darkly with an anonymous user and want to re-initialize it for a specific user to receive the flags for that user, you can use the `identify`. This can only be called after `initialize` has been called.

```js
// /app/session/route.js

import Route from 'ember-route';
import service from 'ember-service/inject';

export default Route.extend({
  session: service(),
  launchDarkly: service(),

  model() {
    return this.get('session').getSession();
  },

  afterModel(session) {
    let user = {
      key: session.get('user.id'),
      firstName: session.get('user.firstName'),
      email: session.get('user.email')
    };

    return this.get('launchDarkly').identify(user);
  }
});
```

### Templates

ember-launch-darkly provides a `variation` template helper to check your feature flags.

If your feature flag is a boolean based flag, you might use it in an `{{if}}` like so:

```hbs
{{#if (variation "new-login-screen")}}
  {{login-screen}}
{{else}}
  {{old-login-screen}}
{{/if}}
```

If your feature flag is a multivariate based flag, you might use it in an `{{with}}` like so:

```hbs
{{#with (variation "new-login-screen") as |variant|}}
  {{#if (eq variant "login-screen-a")}
    {{login-screen-a}}
  {{else if (eq variant "login-screen-b")}}
    {{login-screen-b}}
  {{/if}}
{{else}}
  {{login-screen}}
{{/with}}
```

### Javascript

ember-launch-darkly provides a special `variation` import that can be used in Javascript files such as Components.

If your feature flag is a boolean based flag, you might use it in a function like so:

```js
// /app/components/login-page/component.js

import Component from 'ember-component';
import computed from 'ember-computed';

import { variation } from 'ember-launch-darkly';

export default Component.extend({
  price: computed(function() {
    if (variation('new-pricing-plan')) {
      return 99.00;
    }

    return 199.00;
  })
});
```

If your feature flag is a multivariate based flag, you might use it in a function like so:

```js
// /app/components/login-page/component.js

import Component from 'ember-component';
import computed from 'ember-computed';

import { variation } from 'ember-launch-darkly';

export default Component.extend({
  price: computed(function() {
    switch (variation('new-pricing-plan')) {
      case 'plan-a':
        return 99.00;
      case 'plan-b':
        return 89.00
      case 'plan-c':
        return 79.00
    }

    return 199.00;
  })
});
```

Finally, you can always just inject the Launch Darkly service and use it as you would any other service:

```js
// /app/components/login-page/component.js

import Component from 'ember-component';
import computed from 'ember-computed';
import service from 'ember-service/inject';

export default Component.extend({
  launchDarkly: service(),

  price: computed('launchDarkly.new-price-plan', function() {
    if (this.get('launchDarkly.new-price-plan')) {
      return 99.00;
    }

    return 199.00;
  }),

  discount: computed(function() {
    if (this.get('launchDarkly').variation('apply-discount')) {
      return 0.5;
    }

    return null;
  })
});
```

## Local feature flags

When `local: true` is set in the Launch Darkly configuration, ember-launch-darkly will retrieve the feature flags and their values from `config/environment.js` instead of the Launch Darkly service. This is useful for development purposes so you don't need to set up a new environment in Launch Darkly, your app doesn't need to make a request for the flags, and you can easily change the value of the flags from the browser console.

The local feature flags are defined in `config/environment.js` like so:

```js
let ENV = {
  launchDarkly: {
    local: true,
    localFeatureFlags: {
      'apply-discount': true,
      'new-pricing-plan': 'plan-a'
    }
  }
}
```

When `local: true`, the Launch Darkly feature service is available in the browser console via `window.ld`. The service provides the following helper methods to manipulate feature flags:

```js
> ld.variation('new-pricing-plan', 'plan-a') // return the current value of the feature flag providing a default if it doesn't exist

> ld.setVariation('new-pricing-plan', 'plan-x') // set the variation value

> ld.enable('apply-discount') // helper to set the return value to `true`
> ld.disable('apply-discount') // helper to set the return value to `false`

> ld.allFlags() // return the current list of feature flags and their values

> ld.user() // return the user that the client has been initialized with
```

## Streaming Feature Flags

Launch Darkly supports the ability to subsribe to changes to feature flags so that apps can react in realtime to these changes. The [`streaming` configuration option](#streaming) allows you to specify, in a couple of ways, which flags you'd like to stream.

To disable streaming completely, use the following configuration:

```js
launchDarkly: {
  streaming: false
}
```

_Note, this is the default behaviour if the `streaming` option is not specified._

To stream all flags, use the following configuration:

```
launchDarkly: {
  streaming: true
}
```

To get more specific, you can select to stream all flags except those specified:

```
launchDarkly: {
  streaming: {
    allExcept: ['apply-discount', 'new-login']
  }
}
```

And, finally, you can specify only which flags you would like to stream:

```
launchDarkly: {
  streaming: {
    'apply-discount': true
  }
}
```

As Launch Darkly's realtime updates to flags uses the [Event Source API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource), certain browsers will require a polyfill to be included. ember-launch-darkly uses [EmberCLI targets](http://rwjblue.com/2017/04/21/ember-cli-targets/) to automatically decide whether or not to include the polyfill. Ensure your project contains a valid `config/targets.js` file if you require this functionality.

## Test Helpers

### Acceptance Tests

Stub the Launch Darkly client in acceptance tests using the provided test client which will default all feature flag values to false, instead of using what's defined in the `localFeatureFlags` config. This allows your tests to start off in a known default state.

```js
import StubClient from 'ember-launch-darkly/test-support/helpers/launch-darkly-client-test';

moduleForAcceptance('Acceptance | Homepage', {
  beforeEach() {
    this.application.__container__.registry.register('service:launch-darkly-client', StubClient)
  }
});

test( "links go to the new homepage", function () {
  visit('/');
  click('a.pricing');
  andThen(function(){
    equal(currentRoute(), 'pricing', 'Should be on the old pricing page');
  });
});
```

ember-launch-darkly provides a test helper, `withVariation`, to make it easy to turn feature flags on and off in acceptance tests. Simply import the test helper in your test, or `tests/test-helper.js` file.

```js
import 'ember-launch-darkly/test-support/helpers/with-variation';
import StubClient from 'ember-launch-darkly/test-support/helpers/launch-darkly-client-test';

moduleForAcceptance('Acceptance | Homepage', {
  beforeEach() {
    this.application.__container__.registry.register('service:launch-darkly-client', StubClient)
  }
});

test( "links go to the new homepage", function () {
  withVariation('new-pricing-plan', 'plan-a');

  visit('/');
  click('a.pricing');
  andThen(function(){
    equal(currentRoute(), 'new-pricing', 'Should be on the new pricing page');
  });
});
```

### Integration Tests

Use the test client to stub the Launch Darkly client in integration tests to control the feature flags.

```js
import StubClient from 'ember-launch-darkly/test-support/helpers/launch-darkly-client-test';

moduleForComponent('my-component', 'Integration | Component | my component', {
  integration: true,
  beforeEach() {
    // register the stub service
    this.register('service:launch-darkly-client', StubClient);

    // inject here if you want to be able to inspect/manipulate the service in tests
    this.inject.service('launch-darkly-client', { as: 'launchDarklyClient' });
  }
});

test('new pricing', function(assert) {
  this.render(hbs`
    {{#if (variation "new-pricing-page")}}
      <h1 class="price">£ 99</h1>
    {{else}}
      <h1 class="price">£ 199</h1>
    {{/if}}
  `);

  this.get('launchDarklyClient').enable('new-pricing-page');

  assert.equal(this.$('.price').text().trim(), '£ 99', 'New pricing displayed');
});
```

## TODO

- Implement support for `secure` mode ([#9](https://github.com/kayako/ember-launch-darkly/issues/9))

<p align="center"><sub>Made with :heart: by The Kayako Engineering Team</sub></p>
