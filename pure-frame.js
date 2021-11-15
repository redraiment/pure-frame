const React = require('react');
const { useState, useEffect } = React;
const ReactDOM = require('react-dom');
const { fromJS, is, isMap, isList } = require('immutable');
const { v4: uuid } = require('uuid');

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
 * Events and Reducers.
 */
const reducers = {};

/**
 * Data Sources and Fetchers.
 */
const fetchers = {};

/**
 * Effects and Performers;
 */
const performers = {};

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
    if (!(id in snapshots)) {
        snapshots[id] = compute(id);
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

/* # Event Dispatch */

/**
 * Dispatch `event` synchronized.
 */
const dispatchSync = event => {
    const id = isList(event)? event.get(0): event[0];
    if (!(id in reducers)) {
        console.warn(`No reducer for event ${event}`);
        return;
    }
    const chain = reducers[id];
    let context = fromJS({ snapshots: {}, effects: {}, event });
    chain.reduce((context, reducer) => reducer(context), context);
};

/**
 * Dispatch `event` asynchronized after `ms` millseconds.
 */
const dispatchLater = (event, ms) => setTimeout(() => dispatchSync(event), ms);

/**
 * Dispatch `event` asynchronized.
 */
const dispatch = event => dispatchLater(event, 0);

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
 * Wrap dataSource fetcher to interceptor.
 */
const fetch = (id, ...params) => ({
    id,
    before: context => {
        const fetcher = fetchers[id];
        const snapshot = fetcher(context.get('snapshots'), params);
        return context.setIn(['snapshots', id], snapshot);
    }
});

/* # Event Reducers */

/**
 * Wrap event reducer to interceptor.
 */
const wrapReducerToInterceptor = (id, fn) => ({
    id,
    before: context => {
        const snapshots = context.get('snapshots');
        const event = context.get('event');
        const effects = fn(snapshots, event);
        return context.mergeDeep(fromJS({ effects }));
    }
});

/**
 * Define reducer.
 * - id: event id.
 * - interceptors: the interceptors between standard interceptors and reducer.
 * - reducer: reducer.
 */
const defineReducer = (id, interceptors, reducer) => {
    const chain = [...standardInterceptors,
                   ...interceptors,
                   wrapReducerToInterceptor(id, reducer)];
    reducers[id] = [];

    chain.filter(interceptor => typeof(interceptor.before) === 'function')
        .map(interceptor => interceptor.before)
        .forEach(before => reducers[id].push(before));
    chain.reverse()
        .filter(interceptor => typeof(interceptor.after) === 'function')
        .map(interceptor => interceptor.after)
        .forEach(after => reducers[id].push(after));
};

/**
 * Wrap state reducer to reducer.
 */
const wrapStateReducerToReducer = reducer => (coffects, event) => fromJS({ state: reducer(coffects.get('state'), event) });

/**
 * Define state reducer.
 * - id: event id.
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
    defineFetcher,
    fetch,
    definePerformer,
    defineReducer,
    defineStateReducer,
    defineExtractor,
    defineTransformer,
    defineView,
    PureFrameRoot
};
