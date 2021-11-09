Pure-frame
====

A data-driven, functional, and reactive framework for building Modern Web Apps in JavaScript. It leverages React, inspired by [re-frame](https://day8.github.io/re-frame/re-frame/).

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
    dispatch,
    defineStateEventHandler,
    defineExtractor,
    defineView,
} from 'pure-frame';

// Step 1: create pure function component.
const Viewport = defineView([':count'], count => (
    <>
      <h1>Hello pure-frame</h1>
      <p>
        <label>Count is: </label>
        <span>{count}</span>
      </p>
      <p>
        <button onClick={() => dispatch([':increase'])}>Increase</button>
      </p>
    </>
));

// Step 2: provide data (from application global state) for component.
defineExtractor(':count', 'count');

// Step 3: handle event from component.
defineStateEventHandler(':increase', state =>
    state.update('count', count => count + 1));

// Step 0: initialize
ReactDOM.render(
    <PureFrameRoot state={{ count: 0 }}>
      <Viewport />
    </PureFrameRoot>,
    document.getElementById('app')
);
```

## Step 3: start

```sh
yarn react-scripts start
```

![exapmle.png](https://raw.githubusercontent.com/redraiment/pure-frame/master/example.gif)
