# LiveChat Agent App SDK

This SDK is a set of tools that will help you integrate your apps with the [LiveChat Agent App](https://my.livechatinc.com/).

[![mit](https://img.shields.io/badge/license-MIT-blue.svg)](https://choosealicense.com/licenses/mit/)
![npm](https://img.shields.io/npm/v/@livechat/agent-app-sdk?label=version)
[![turborepo](https://img.shields.io/badge/maintained%20with-turborepo-blueviolet)](https://turbo.build/repo)

For full documentation please head to [LiveChat Docs](https://developers.livechatinc.com/docs/extending-ui/extending-agent-app/).

## Installation

The package can be installed directly from NPM.

```
npm install --save @livechat/agent-app-sdk
```

The NPM package is distributed both as a CommonJS and ES6 module. It should be used together with a module bundler, such as Webpack or Rollup.

We also distrubute a UMD build of the package, which can be used directly in the browser.

```html
<script src="https://unpkg.com/@livechat/agent-app-sdk@1.6.3/dist/agentapp.umd.min.js"></script>
```

## Basic usage

Use one of the methods exported by the SDK.

### `createDetailsWidget(): Promise<IDetailsWidget>`

Creates a widget instance to be used in the Chat Details context.

```js
import { createDetailsWidget } from ‘@livechat/agent-app-sdk’;

createDetailsWidget().then(widget => {
  // do something with the widget
});
```

### `createMessageBoxWidget(): Promise<IDetailsWidget>`

Creates a widget instance to be used in MessageBox.

```js
import { createMessageBoxWidget } from ‘@livechat/agent-app-sdk’;

createMessageBoxWidget().then(widget => {
  // do something with the widget
});
```

### `createFullscreenWidget(): Promise<IFullscreenWidget>`

Creates a widget instance to be used as a Fullscreen app.

```js
import { createFullscreenWidget } from ‘@livechat/agent-app-sdk’;

createFullscreenWidget().then(widget => {
  // do something with the widget
});
```

### `createSettingsWidget(): Promise<ISettingsWidget>`

Creates a widget instance to be used as a Settings app.

```js
import { createSettingsWidget } from ‘@livechat/agent-app-sdk’;

createSettingsWidget().then(widget => {
  // do something with the widget
});
```

## Widgets (`IWidget`)

All widgets share a common interface.

- `on(eventName: string, eventHandler: (data: any) => void): void`) - registers the event handler to be called when a given event occurs

- `off(eventName: string, eventHandler: (data: any) => void): void`) - unregisters the previously registered handler from the event

You can use it to track the events happening in the Agent App.

```js
import { createDetailsWidget } from ‘@livechat/agent-app-sdk’;

createDetailsWidget().then(widget => {
  function onCustomerProfile(profile) {
    // do something with the profile when it changes
  }

  // register when you need it
  widget.on(‘customer_profile’, onCustomerProfile);

  // ...

  // unregister when you’re done
  widget.off(‘customer_profile’, onCustomerProfile);
});
```

Each widget type offers a different set of events that you can listen to. Check them out in the descriptions below.

## Payments

All widgets allow you to pass a registered charge and display a summary of it to the customer within the payment modal in the Agent App application, enabling them to complete or decline the transaction.

### Events

#### `transaction_accepted`

Emitted when a payment transaction is approved by the customer and successfully processed by the Billing API.

```ts
type TransactionEvent {
  chargeId: string;
}
```

#### `transaction_declined`

Emitted when a payment transaction is declined by the customer (e.g., the user closes the payment modal or clicks the cancel button), and the charge is subsequently marked as declined in the Billing API.

```ts
type TransactionEvent {
  chargeId: string;
}
```
#### `transaction_failed`

Emitted when a payment transaction fails and cannot be processed by the billing API.

```ts
type TransactionError {
  error: unknown;
}
```

#### `update_billing_cycle`

This event is triggered when a customer selects a different billing cycle for a transaction. It only emits if the `showBillingCyclePicker` flag is set to `true` in the `metadata` object at the start of the transaction. The event includes the new billing cycle number and key charge details, allowing you to register the updated charge with the provided information.

```ts
type UpdateBillingCycleEvent {
  billingCycle: number,
  chargeId: string,
  paymentIntent: {
    name: string,
    price: number,
    per_account: boolean,
    test: boolean,
    return_url: string | null,
    months?: number,
    trial_days?: number,
    quantity?: number,
    metadata: {
      type: string,
      isExternalTransaction: boolean,
      showBillingCyclePicker: boolean,
      icon: string,
      description?: string,
    }
  }
}
```

### Methods

#### `startTransaction(charge: Charge, metadata: Metadata): Promise<void>`

This method allows you to pass a registered charge and accompanying metadata to the Agent App. The payment modal will then be displayed to the customer, enabling them to complete the transaction. For more information on registering a charge, refer to the [Billing API documentation](https://platform.text.com/docs/monetization/billing-api).

```ts
const charge = {...} // Billing API charge object
const metadata = {
  icon: "https://icon.url";
  description: "This is a description of the transaction.";
  showBillingCyclePicker: true; // optional, use if you want to display the billing cycle picker to the customer
}

widget.startTransaction(charge, metadata);
```

## Details widget (`IDetailsWidget`)

A type of widget that has access to the Chat Details context.

### Events

#### `customer_profile`

Emitted when an agent opens a conversation within Chats, Archives, or the customer profile in the Customers sections. The handler will get the customer profile object as an argument:

```ts
interface ICustomerProfile {
  id: string;
  name: string;
  geolocation: {
    longitude?: string;
    latitude?: string;
    country: string;
    country_code: string;
    region: string;
    city: string;
    timezone: string;
  };
  email?: string;
  chat: {
    id?: string;
    groupID: string;
    preChatSurvey: { question: string; answer: string }[];
  };
  source: 'chats' | 'archives' | 'customers';
}
```

#### `customer_details_section_button_click`

Emitted when agent clicks a button located in a custom section in Customer Details. The handler gets the following payload:

```ts
interface ICustomerDetailsSectionButtonClick {
  buttonId: string;
}
```

The `buttonId` property reflects the `id` specified for the button in the section definition.

### Methods

#### `getCustomerProfile(): ICustomerProfile | null`

Gets the customer profile recorded most recently. Returns the `ICustomerProfile` object, which is identical to the one emitted by the `customer_profile` event or `null` (if no profile was registered).

#### `putMessage(text: string): Promise<void>`

Appends the text to the message box of the currently opened chat.

#### `modifySection(section): Promise<void>`

With this method, you can modify any custom section declared in the widget's initial state in Developers Console. The `section` argument should be an object implementing the section defintion interface, for example:

```javascript
const section = {
  title: ‘My section’,
  components: [
    // …
    {
      type: ‘button’,
      data: {
        label: ‘My section button’,
        id: ‘section-button’
      }
    }
    // …
  ]
};

widget.modifySection(section);
```

The `title` of a given section has to match the one specified in the initial state. Otherwise, the section won't change. Also, the Agent App ignores the commands without valid section definitions. Make sure that the definition you're sending is correct.

## MessageBox widget (`IMessageBoxWidget`)

### Events

#### `customer_profile`

Emitted after the widget is opened in the MessageBox. The handler will get a `ICustomerProfile` object (check the documentation for the `customer_profile` event in the [Details widget](#details-widget-idetailswidget) to see the how the object is structured).

#### `message_sent`

Emitted after the message is sent by the agent. Keep in mind that the message has to be set with [`putMessage`] method in order to be sent.

### Methods

#### `putMessage(msg: IRichMessage | string): Promise<void>`

Sets a message to be stored by MessageBox. Calling this method does not automatically send the message right away. The message is sent once an agent clicks the _Send_ button. The message accepts the regular message type as `string` or rich messages. The latter must implement the `IRichMessage` interface.

```javascript
const richMessage = {
  template_id: 'cards',
  elements: [
    {
      title: 'My cat photo',
      image: 'imgs/john-the-cat.jpg'
    }
  ]
};

widget.putMessage(richMessage);
```

#### `getCustomerProfile(): ICustomerProfile | null`

Gets the customer profile recorded most recently. Returns the `ICustomerProfile` object, which is identical to the one emitted by the `customer_profile` event or `null` (if no profile was registered).

### Rich Message object format

- `custom_id`, `properties` and `elements` are optional
- `elements` may contain 1-10 element objects
- all `elements` properties are optional: `title`, `subtitle`, `image`, and `buttons`
- property `url` on `image` is required
- optional `image` properties: `name`, `content_type`, `size`, `width`, and `height`
- `buttons` may contain 1-11 button objects
- `template_id` describes how the event should be presented in an app
- `elements.buttons.postback_id` describes the action sent via the `send_rich_message_postback` method
- multiple buttons (even from different elements) can contain the same `postback_id`; calling `send_rich_message_postback` with this id will add a user to all these buttons at once.
- `elements.buttons.user_ids` describes users who sent the postback with `"toggled": true`

## Fullscreen widget (`IFullscreenWidget`)

### Events

#### `page_data`

Emitted when widget in initialized. The handler will get the main window page data object as an argument:

```ts
interface IPageData {
  queryParams: object;
}
```

### Methods

#### `setNotificationBadge(count: number | null): Promise<void>`

Displays a red badge on top of the Fullscreen app icon. Use this to notify Agents there’s something important inside the widget. Make sure Agents can dismiss the notification to avoid cluttered UI.

#### `navigate(pathname: string): Promise<void>`

Navigates LiveChat Agent App to given pathname.

#### `setReportsFilters(filters: ReportsFilters): Promise<void>`

Updates "Reports" section filters to given `filters` object.

#### `getPageData(): IPageData | null`

Gets the main window page data recorded most recently. Returns the `IPageData` object, which is identical to the one emitted by the `page_data` event or `null` (if no data were registered).

## Settings widget (`ISettingsWidget`)

### Events

#### `page_data`

Emitted when widget in initialized. The handler will get the main window page data object as an argument:

```ts
interface IPageData {
  queryParams: object;
}
```

### Methods

#### `getPageData(): IPageData | null`

Gets the main window page data recorded most recently. Returns the `IPageData` object, which is identical to the one emitted by the `page_data` event or `null` (if no data were registered).

#### `redirect(target: string): Promise<void>`

Redirects using the main window. Calling this method will send postmessage to Agent App, witch will be handled there. After that, redirect using `window` object is performed.

```javascript
const target = 'https://example.com';

widget.redirect(target);
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first, so we can discuss what you would like to change. Follow a [Contributing guide](https://github.com/livechat/products-sdk/blob/master/CONTRIBUTING.md) for more details.

## License

The code and documentation in this project are released under the [MIT License](https://choosealicense.com/licenses/mit/).
