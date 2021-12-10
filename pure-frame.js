const React = require('react');
const { useState, useEffect } = React;
const { fromJS, is, isMap, isList } = require('immutable');
const { v4: uuid } = require('uuid');

/* # Common Utilities */

const isA = (o, type) => typeof(o) === type;
const isUndefined = o => isA(o, 'undefined');
const isString = o => isA(o, 'string');
const isFunction = o => isA(o, 'function');
const isArray = o => Array.isArray(o);
const isObject = o => !isArray(o) && isA(o, 'object');

const toJS = o => (isMap(o) || isList(o))? o.toJS(): o;

/* # Inner Data */

/**
 * Cache the latest value of state, extractors and transformers.
 */
const snapshots = {
    state: fromJS({}) // Preset Global State
};

/**
 * Definitions of extractors and transformers.
 */
const formulas = {};

/**
 * Relations between extractors and transformers.
 */
const dependencies = {
    upstreams: {},
    downstreams: {}
};

/**
 * Actions and Reducers.
 */
const reducers = {};

/**
 * Data Sources and Fetchers.
 */
const fetchers = {};

/**
 * Effects and Performers.
 */
const performers = {};

/**
 * Views.
 */
const views = {};

/* # Compute Management */

let computeIfAbsent = null; // pre-declare

/**
 * Force compute the formula of `id`.
 * The upstream formulas will be computed
 * if and only if it has not cached.
 */
const compute = id => {
    const upstreams = dependencies.upstreams[id] || [];
    const params = upstreams.map(computeIfAbsent);
    const formula = formulas[id];
    return isFunction(formula)? formula(...params): null;
};

/**
 * Compute the formula of `id` if and only if it has not cached.
 * The result will be cached.
 */
computeIfAbsent = id => {
    if (!(id in snapshots)) {
        snapshots[id] = fromJS(compute(id));
    }
    return snapshots[id];
};

/**
 * Define a formula.
 * - id: the unique formula id.
 * - upstreams: list of dependent formulas.
 * - fn: operator.
 */
const defineFormula = (id, upstreams, fn) => {
    formulas[id] = fn;
    dependencies.upstreams[id] = upstreams;
    upstreams.forEach(upstream => {
        if (!(upstream in dependencies.downstreams)) {
            dependencies.downstreams[upstream] = [];
        }
        dependencies.downstreams[upstream].push(id);
    });
};

/**
 * Unregister formula.
 */
const deleteFormula = id => {
    delete formulas[id];
    dependencies.upstreams[id].forEach(upstream => {
        const downstreams = dependencies.downstreams[upstream];
        const index = downstreams.indexOf(upstream);
        if (index > -1) {
            downstreams.splice(index, 1);
        }
    });
    delete dependencies.upstreams[id];
};

/* # Snapshots */

/**
 * reset the value of `id`.
 * When the value changed, downstream formulas of `id` will be re-computed.
 */
const reset = (id, newValue) => {
    const origin = snapshots[id];
    if (!is(origin, newValue)) {
        snapshots[id] = newValue;
        const downstreams = dependencies.downstreams[id] || [];
        downstreams.filter(downstream => downstream in formulas)
            .forEach(downstream => reset(downstream, compute(downstream)));
    }
};

/**
 * Get the value of `id`.
 * Formulas will be computed if need.
 */
const deref = computeIfAbsent;

/* # Action Dispatch */

/**
 * Dispatch `action` synchronized.
 */
const dispatchSync = action => {
    const id = isList(action)? action.get(0): action[0];
    if (!(id in reducers)) {
        console.warn(`No reducer for action ${action}`);
        return;
    }
    const chain = reducers[id];
    let context = fromJS({ snapshots: {}, effects: {}, action });
    chain.reduce((context, reducer) => reducer(context), context);
};

/**
 * Dispatch `action` asynchronized after `ms` millseconds.
 */
const dispatchLater = (action, ms) => setTimeout(() => dispatchSync(action), ms);

/**
 * Dispatch `action` asynchronized.
 */
const dispatch = action => dispatchLater(action, 0);

/**
 * Generic Dispatch.
 */
const dispatchGeneric = (action, mode = 'async', ms = 0) => {
    switch (mode) {
    case 'sync':
        return dispatchSync(action);
    case 'later':
        return dispatchLater(action, ms);
    default:
        return dispatch(action);
    }
};

/* # Effect Performers */

/**
 * Define effect performer.
 */
const definePerformer = (id, performer) => performers[id] = performer;

/**
 * Preset effect performers.
 */
definePerformer('dispatch', dispatch);
definePerformer('dispatch-later', dispatchLater);
definePerformer('dispatch-sync', dispatchSync);

/* # Interceptors */

/**
 * Preset interceptors.
 */
const standardInterceptors = [{
    /**
     * Inject state into snapshots of context.
     */
    id: 'inject-state',
    before: context => context.setIn(['snapshots', 'state'], deref('state'))
}, {
    /**
     * Perform effects:
     * 1. Reset state if provided.
     * 2. Perform ordered effects in fx.
     */
    id: 'do-fx',
    after: context => {
        const state = context.getIn(['effects', 'state']);
        if (isMap(state)) {
            reset('state', state);
        }

        const fx = context.getIn(['effects', 'fx']);
        if (isList(fx)) {
            fx.filter(([effect]) => effect in performers)
                .forEach(([effect, ...params]) => performers[effect](...params));
        }

        return context;
    }
}];

/* # Data Sources and Fetchers */

/**
 * Define data source and fetcher.
 */
const defineFetcher = (id, fetcher) => fetchers[id] = fetcher;

/**
 * Execute data fetch.
 */
const dataFetch = (snapshots, id, params) =>
      fetchers[id](snapshots, ...params.map(param => fromJS(param)));

/**
 * Wrap dataSource fetcher to interceptor.
 */
const fetcher = (id, ...params) => ({
    id,
    before: context => {
        const snapshot = dataFetch(context.get('snapshots'), id, params);
        return context.setIn(['snapshots', id], fromJS(snapshot));
    }
});

/**
 * Fetch data synchronized.
 * It's useful for initialize state.
 * Returns JS type data.
 */
const fetch = (id, ...params) => {
    const data = dataFetch(fromJS({
        state: snapshots.state
    }), id, params);
    return toJS(data);
};

/* # Action Reducers */

/**
 * Wrap action reducer to interceptor.
 */
const wrapReducerToInterceptor = (id, fn) => ({
    id,
    before: context => {
        const snapshots = context.get('snapshots');
        const action = context.get('action');
        const effects = fn(snapshots, action);
        return context.mergeDeep(fromJS({ effects }));
    }
});

/**
 * Define reducer.
 * - id: action id.
 * - interceptors: optional interceptors between standard interceptors and reducer.
 * - reducer: reducer.
 */
const defineReducer = (id, interceptors, reducer) => {
    if (isUndefined(reducer)) {
        reducer = interceptors;
        interceptors = [];
    }
    const chain = [...standardInterceptors,
                   ...interceptors,
                   wrapReducerToInterceptor(id, reducer)];
    reducers[id] = [];

    chain.filter(interceptor => isFunction(interceptor.before))
        .map(interceptor => interceptor.before)
        .forEach(before => reducers[id].push(before));
    chain.reverse()
        .filter(interceptor => isFunction(interceptor.after))
        .map(interceptor => interceptor.after)
        .forEach(after => reducers[id].push(after));
};

/**
 * Wrap state reducer to reducer.
 */
const wrapStateReducerToReducer = reducer => (coffects, action) => fromJS({ state: reducer(coffects.get('state'), action) });

/**
 * Define state reducer.
 * - id: action id.
 * - reducer: state reducer.
 */
const defineStateReducer = (id, reducer) => defineReducer(id, [], wrapStateReducerToReducer(reducer));

/* # Query */

/**
 * Define state extractor: extract the data from `state`.
 * - id: formula id.
 * - ...path: the data path in state.
 */
const defineExtractor = (id, ...path) => defineFormula(id, ['state'], state => state.getIn(path));

/**
 * Define transformer: deriving data of extractor or transformer.
 * - id: formula id.
 * - upstreams: id list of dependent formulas.
 * - fn: operator.
 */
const defineTransformer = defineFormula;

/* # View */

/**
 * Generates dispatchers with action declares.
 */
const dispatchersOf = actions => Object.fromEntries(
    Object.entries(actions)
        .map(([prop, action]) =>
            [prop, isString(action)? { id: action }: action])
        .map(([prop, { id, mode = 'async', ms = 0 }]) =>
            [prop, (...params) => dispatchGeneric([id, ...params], mode, ms)]));

/**
 * Define view: connect formulas and action with pure function view.
 * - id: optional view id.
 * - options:
 *   - injects: map of watching formulas.
 *              key is formula id.
 *              value is prop name of component, the value of formula.
 *   - actions: map of dispatching actions.
 *              key is prop name of component, the function to dispatch action.
 *              value is string action id, or object {
 *                id: string, // action id.
 *                mode: 'async' | 'sync' | 'later', // 'async' default.
 *                ms: number // 'later' mode only, 0 default.
 *              }.
 * - component: pure function component.
 */
const defineView = (id, options, component) => {
    if (!isString(id) && isUndefined(component)) {
        component = options;
        options = id;
        id = undefined;
    }

    const { injects = {}, actions = {} } = options;
    const formulaIds = Object.keys(injects);
    const injectionNames = Object.values(injects);
    const dispatchers = dispatchersOf(actions);
    const view = props => {
        const states = formulaIds.map(deref).map(useState);
        const getters = states.map(state => state[0]).map(toJS);
        const injections = Object.fromEntries(injectionNames.map((name, index) => [name, getters[index]]));

        useEffect(() => {
            const setters = states.map(state => state[1]);
            const formulaId = isUndefined(id)? uuid(): id;
            defineFormula(formulaId, formulaIds, (...params) => {
                setters.forEach((setter, index) => {
                    setter(params[index]);
                });
            });
            return () => deleteFormula(formulaId);
        }, []);

        return React.createElement(component, {
            ...props,
            ...injections,
            ...dispatchers
        }, props.children);
    };

    if (isString(id)) {
        views[id] = view;
    }

    return view;
};

/**
 * Get view by id.
 */
const viewOf = id => views[id];

/**
 * The root of pure frame.
 * - state: default value of state.
 */
const PureFrameRoot = ({ state = {}, children }) => {
    reset('state', fromJS(state));
    return React.createElement(React.Fragment, null, children);
};

/* # Events and Listeners */

/**
 * Wrap action dispatcher to event listener.
 */
const wrapDispatcherToListener = dispatcher => {
    if (isString(dispatcher)) {
        return event => ({ action: [dispatcher, event] });
    } else if (isObject(dispatcher)) {
        return event => ({
            action: [dispatcher.id, event],
            mode: dispatcher.mode,
            ms: dispatcher.ms
        });
    } else if (isFunction(dispatcher)) {
        return event => {
            const action = dispatcher(event);
            if (isArray(action)) {
                return { action };
            } else if (isObject(action)) {
                return action;
            } else {
                throw `Invalid action: ${action}`;
            }
        };
    } else {
        throw `Invalid dispatcher: ${dispatcher}`;
    }
};

/**
 * Define event listener: to dispatch action when event fired.
 * - target: object can receive events and may have listeners for them.
 * - type: a case-sensitive string representing the event type to listen for.
 * - dispatcher: string or function.
 *   - string: action id. the event object will be used as params.
 *   - function: to cast event to action and params.
 * - options: options or useCapture, default `false`.
 */
const defineListener = (target, type, dispatcher, options = false) => {
    const listener = wrapDispatcherToListener(dispatcher);
    return target.addEventListener(type, event => {
        const { action, mode, ms } = listener(event);
        dispatchGeneric(action, mode, ms);
    }, options);
};

/**
 * Wrap setInterval & setTimeout as clock events.
 */
const clock = {
    addEventListener: (type, listener, options) => {
        const ms = isObject(options)? options.ms: options;
        const fn = isObject(options) && options.timestamp === true? () => listener(Date.now()): listener;

        switch (type) {
        case 'interval':
            return setInterval(fn, ms);
        case 'timeout':
            return setTimeout(fn, ms);
        default:
            throw `Unknown clock event type: ${type}`;
        }
    }
};

module.exports = {
    clock,
    dispatchSync,
    dispatchLater,
    dispatch,
    defineFetcher,
    fetcher,
    fetch,
    definePerformer,
    defineReducer,
    defineStateReducer,
    defineExtractor,
    defineTransformer,
    defineView,
    viewOf,
    defineListener,
    PureFrameRoot
};
