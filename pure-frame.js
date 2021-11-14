const React = require('react');
const { useState, useEffect } = React;
const ReactDOM = require('react-dom');
const { fromJS, is, isMap, isList } = require('immutable');
const { v4: uuid } = require('uuid');

/* # Inner Data */

/**
 * Cache the latest value of state, extractors and transformers.
 */
const caches = {
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
 * Events and Handlers.
 */
const events = {};

/**
 * Data Sources and Handlers.
 */
const dataSources = {};

/**
 * Effects and Handlers;
 */
const effects = {};

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
    return typeof(formula) === 'function'? formula(...params): null;
};

/**
 * Compute the formula of `id` if and only if it has not cached.
 * The result will be cached.
 */
computeIfAbsent = id => {
    if (!(id in caches)) {
        caches[id] = compute(id);
    }
    return caches[id];
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

/* # Data Management */

/**
 * reset the value of `id`.
 * When the value changed, downstream formulas of `id` will be re-computed.
 */
const reset = (id, newValue) => {
    const origin = caches[id];
    if (!is(origin, newValue)) {
        caches[id] = newValue;
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

/* # Event Dispatch */

/**
 * Dispatch `event` synchronized.
 */
const dispatchSync = event => {
    const id = isList(event)? event.get(0): event[0];
    if (!(id in events)) {
        console.warn(`No handler for event ${event}`);
        return;
    }
    const chain = events[id];
    let context = fromJS({ world: {}, effects: {}, event });
    chain.reduce((context, handler) => handler(context), context);
};

/**
 * Dispatch `event` asynchronized after `ms` millseconds.
 */
const dispatchLater = (event, ms) => setTimeout(() => dispatchSync(event), ms);

/**
 * Dispatch `event` asynchronized.
 */
const dispatch = event => dispatchLater(event, 0);

/* # Effect Handlers */

/**
 * Define custome effect handler.
 */
const defineEffectHandler = (id, handler) => effects[id] = handler;

/**
 * Preset effect handlers.
 */
defineEffectHandler('dispatch', dispatch);
defineEffectHandler('dispatch-later', dispatchLater);
defineEffectHandler('dispatch-sync', dispatchSync);

/* # Interceptors */

/**
 * Preset interceptors.
 */
const standardInterceptors = [{
    /**
     * Inject state into world of context.
     */
    id: 'inject-state',
    before: context => context.setIn(['world', 'state'], deref('state'))
}, {
    /**
     * Process effects:
     * 1. Reset state if provided.
     * 2. Process ordered effects in fx of effects..
     */
    id: 'do-fx',
    after: context => {
        const state = context.getIn(['effects', 'state']);
        if (isMap(state)) {
            reset('state', state);
        }

        const fx = context.getIn(['effects', 'fx']);
        if (isList(fx)) {
            fx.filter(([effect]) => effect in effects)
                .forEach(([effect, ...params]) => effects[effect](...params));
        }

        return context;
    }
}];

/* # Data Sources/Coeffects Handlers */

/**
 * Define custome data source.
 */
const defineDataSource = (id, handler) => dataSources[id] = handler;

/**
 * Wrap dataSource handler to interceptor.
 */
const dataSource = (id, ...params) => ({
    id,
    before: context => {
        const handler = dataSources[id];
        const dataSource = handler(context.get('world'), params);
        return context.setIn(['world', id], dataSource);
    }
});

/* # Event Handlers */

/**
 * Wrap event handler to interceptor.
 */
const wrapWorldEventHandlerToInterceptor = (id, fn) => ({
    id,
    before: context => {
        const world = context.get('world');
        const event = context.get('event');
        const effects = fn(world, event);
        return context.mergeDeep(fromJS({ effects }));
    }
});

/**
 * Define world event handler.
 * - id: event id.
 * - interceptors: the interceptors between standard interceptors and handler.
 * - handler: world event handler.
 */
const defineWorldEventHandler = (id, interceptors, handler) => {
    const chain = [...standardInterceptors,
                   ...interceptors,
                   wrapWorldEventHandlerToInterceptor(id, handler)];
    events[id] = [];

    chain.filter(interceptor => typeof(interceptor.before) === 'function')
        .map(interceptor => interceptor.before)
        .forEach(before => events[id].push(before));
    chain.reverse()
        .filter(interceptor => typeof(interceptor.after) === 'function')
        .map(interceptor => interceptor.after)
        .forEach(after => events[id].push(after));
};

/**
 * Wrap state event handler to world event handler.
 */
const wrapStateEventHandlerToWorldEventHandler = handler => (coffects, event) => fromJS({ state: handler(coffects.get('state'), event) });

/**
 * Define state event handler.
 * - id: event id.
 * - handler: state handler.
 */
const defineStateEventHandler = (id, handler) => defineWorldEventHandler(id, [], wrapStateEventHandlerToWorldEventHandler(handler));

/* # Query */

/**
 * Define state data extractor: extract the data from `state`.
 * - id: formula id.
 * - ...path: the data path of state.
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
 * Generates dispatchers with events declares.
 */
const dispatchersOf = events => Object.fromEntries(
    Object.entries(events)
        .map(([prop, event]) =>
            [prop, typeof(event) === 'string'? {id: event}: event])
        .map(([prop, { id, mode = 'async', ms = 0 }]) => {
            switch (mode) {
            case 'sync':
                return [prop, (...params) =>
                    dispatchSync([id, ...params])];
            case 'later':
                return [prop, (...params) =>
                    dispatchLater([id, ...params], ms)];
            default:
                return [prop, (...params) =>
                    dispatch([id, ...params])];
            }
        }));

/**
 * Define view: connect formulas and events with pure function view.
 * - inject: map of watching formulas.
 *           key is formula id.
 *           value is prop name of component, the value of formula.
 * - events: map of firing events.
 *           key is prop name of component, the function to dispatch event.
 *           value is string event id, or object {
 *             id: string, // event id.
 *             mode: 'async' | 'sync' | 'later', // 'async' default.
 *             ms: number // 'later' mode only, 0 default.
 *           }.
 * - view: pure function component.
 */
const defineView = ({ inject = {}, events = {} }, view) => {
    const formulaIds = Object.keys(inject);
    const injectionNames = Object.values(inject);
    const dispatchers = dispatchersOf(events);
    return props => {
        const states = formulaIds.map(deref).map(useState);
        const getters = states
              .map(state => state[0])
              .map(getter => isMap(getter) || isList(getter)? getter.toJS(): getter);
        const injections = Object.fromEntries(injectionNames.map((name, index) => [name, getters[index]]));

        useEffect(() => {
            const setters = states.map(state => state[1]);
            defineFormula(uuid(), formulaIds, (...params) => {
                setters.forEach((setter, index) => {
                    setter(params[index]);
                });
            });
        }, []);

        return React.createElement(view, {
            ...props,
            ...injections,
            ...dispatchers
        }, props.children);
    };
};

/**
 * The root of pure frame.
 * - state: default value of state.
 */
const PureFrameRoot = ({ state = {}, children }) => {
    reset('state', fromJS(state));
    return React.createElement(React.Fragment, null, children);
};

module.exports = {
    dispatchSync,
    dispatchLater,
    dispatch,
    defineDataSource,
    dataSource,
    defineEffectHandler,
    defineWorldEventHandler,
    defineStateEventHandler,
    defineExtractor,
    defineTransformer,
    defineView,
    PureFrameRoot
};
