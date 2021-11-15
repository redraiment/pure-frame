Pure-frame
====

A data-driven, functional, and reactive framework for building Modern Web Apps in JavaScript. It leverages React, inspired by [re-frame](https://day8.github.io/re-frame/re-frame/).

# Concepts

![Data Flow](https://raw.githubusercontent.com/redraiment/pure-frame/master/data-flow.png)

# Install 

## npm

```sh
npm i pure-frame
```

## yarn

```sh
yarn add pure-frame
```

# Example with create-react-app

## Step 0: setup

```sh
mkdir -p example/{src,public}
cd example

yarn init -y
yarn add pure-frame
yarn add --dev react-scripts
```

## Step 1: create public/index.html

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=Edge" />
    <meta name="renderer" content="webkit" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <title>Hello pure-frame</title>
  </head>
  <body>
    <noscript>please enable javascript to continue using this application.</noscript>
    <div id="app"></div>
  </body>
</html>
```

## Step 2: create src/index.jsx

```js
import React from 'react';
import ReactDOM from 'react-dom';

import {
    PureFrameRoot,
    defineExtractor,
    defineStateReducer,
    defineView,
} from 'pure-frame';

// Step 1: create pure function component.
const ClickCount = ({ count, increase }) => (
    <>
      <h1>Hello pure-frame</h1>
      <p>
        <label>Count is: </label>
        <span>{count}</span>
      </p>
      <p>
        <button onClick={increase}>Increase</button>
      </p>
    </>
);

// Step 2: define view, injects formulas and declares events.
const ClickCountView = defineView({
    inject: {
        ':count': 'count'
    },
    events: {
        'increase': ':increase'
    }
}, ClickCount);

// Step 3: provide data (from state snapshot) for component.
defineExtractor(':count', 'count');

// Step 4: handle event from component.
defineStateReducer(':increase', state =>
    state.update('count', count => count + 1));

// Step 5: Compose components.
ReactDOM.render(
    <PureFrameRoot state={{ count: 0 }}>
      <ClickCountView />
    </PureFrameRoot>,
    document.getElementById('app')
);
```

## Step 3: start

```sh
yarn react-scripts start
```

![exapmle.png](https://raw.githubusercontent.com/redraiment/pure-frame/master/example.gif)
