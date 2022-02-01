/// <reference types="react" />
/// <reference types="react-dom" />

import * as React from 'react';
import * as Immutable from 'immutable';

// # PureFrameRoot

export declare type PureFrameRootProps = {
  state?: any,
  children?: React.ReactNode,
};

export declare function PureFrameRoot({ state, children }: PureFrameRootProps): JSX.Element;

// # Dispatcher

export declare type ActionId = string;
export declare type Action = [ActionId, ...any[]];
export declare type DispatcherMode = 'async' | 'sync' | 'later';
export declare type DispatcherOptions = {
  action: Action,
  mode?: DispatcherMode,
  ms?: number,
};
export declare type DispatcherOptionsWrapper = (event?: any) => Action | DispatcherOptions;

export declare function dispatchSync(action: Action);
export declare function dispatchLater(action: Action, ms: number);
export declare function dispatch(action: Action);

// # Event

export declare type EventType = string;
export declare type EventListener = EventListenerOrEventListenerObject;
export declare type EventOptions = any | null;
export declare type EventTarget = { [key: string]: any } & {
  addEventListener: (type: EventType, listener: EventListener, option?: EventOptions) => void;
};

export declare function defineListener(
  target: EventTarget,
  type: EventType,
  dispatcher: ActionId | DispatcherOptions | DispatcherOptionsWrapper,
  options: EventOptions
): void;

export declare type ClockEventType = 'interval' | 'timeout';
export declare type ClockEventListener = (now?: number) => void;
export declare type ClockEventOptions = number | {
  ms: number,
  timestamp?: boolean,
};
export declare const clock: EventTarget;

// # Fetcher

export declare type Snapshot = Immutable.Map<string, any>;
export declare type InterceptorId = string;
export declare type Interceptor = {
  id: InterceptorId,
  before?: (context: Snapshot) => Snapshot,
  after?: (context: Snapshot) => Snapshot,
};

export declare type FetcherId = string;
export declare type Fetcher = (snapshot: Snapshot, ...params: any[]) => any;

export declare function defineFetcher(id: FetcherId, fetcher: Fetcher);
export declare function fetcher(id: FetcherId, ...params: any[]): Interceptor;
export declare function fetch(id: FetcherId, ...params: any[]): any;

// # Reducer

export declare type ReducerId = string;
export declare interface Reducer {
  (snapshot: Snapshot, action: Action): Snapshot;
  (snapshot: Snapshot): Snapshot;
}

export declare function defineReducer(id: ReducerId, interceptors: Interceptor[], reducer: Reducer);
export declare function defineReducer(id: ReducerId, reducer: Reducer);
export declare function defineStateReducer(id: ReducerId, reducer: Reducer);

// # Performer

export declare type PerformerId = string;
export declare type Performer = (...params: any[]) => any;
export declare function definePerformer(id: PerformerId, fn: Performer);

// definePerformer,

// # Formula

export declare type FormulaId = string;
export declare type FormulaDependencies = FormulaId[];
export declare type Formula = (...params: any[]) => any;

export declare function defineExtractor(id: FormulaId, ...path: string[]);
export declare function defineTransformer(id: FormulaId, upstreams: FormulaDependencies, fn: Formula);

// # View

export declare type ViewId = string;

export declare function viewOf(id: ViewId): React.ReactNode;

export declare type DependencyInjection = {
  injects?: { [key: string]: string },
  actions?: { [key: string]: string },
};

export declare function defineView(id: string, dependencies: DependencyInjection, component: React.ReactNode): React.ReactNode;
export declare function defineView(dependencies: DependencyInjection, component: React.ReactNode): React.ReactNode;
