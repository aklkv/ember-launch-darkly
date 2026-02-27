import { tracked } from '@glimmer/tracking';
import { TrackedMap } from 'tracked-built-ins';
import { g, i } from 'decorator-transforms/runtime';

const STORAGE_KEY = 'ember-launch-darkly';

/**
 * Describes how initialization completed (or recovered).
 *
 * - `'initialized'` — LD SDK initialized successfully, flags are live.
 * - `'failed'`      — LD SDK failed to initialize (timeout, network error, etc.).
 *                      Flags come from bootstrap/allFlags and may be empty.
 * - `'local'`       — Running in local mode with `localFlags`.
 */

/**
 * Callback invoked whenever the {@link InitStatus} of the context changes.
 *
 * This is most useful for reacting to post-init recovery: when the LD SDK
 * reconnects after a failed initialization, the status transitions from
 * `'failed'` to `'initialized'`.
 */

/**
 * Callback invoked whenever the LD SDK emits a runtime error.
 *
 * If you do not provide this callback, errors are logged via `@ember/debug`'s
 * `warn()`. If you do, errors are forwarded to your callback instead.
 */

/**
 * Options for constructing a {@link Context}.
 *
 * All properties are optional — a bare `new Context()` produces a valid
 * local-mode context with no flags.
 */

function setPersistedFlags(context) {
  const persistedFlags = window.localStorage.getItem(STORAGE_KEY);
  if (persistedFlags) {
    context.replaceFlags(JSON.parse(persistedFlags));
  }
}
function setCurrentContext(context) {
  setPersistedFlags(context);
  window.__LD__ = context;
}
function getCurrentContext() {
  return window.__LD__ ?? null;
}
function removeCurrentContext() {
  delete window.__LD__;
}
class Context {
  _flags = new TrackedMap();
  _client = null;
  static {
    g(this.prototype, "_initStatus", [tracked]);
  }
  #_initStatus = (i(this, "_initStatus"), void 0);
  static {
    g(this.prototype, "_initError", [tracked]);
  }
  #_initError = (i(this, "_initError"), void 0);
  static {
    g(this.prototype, "_lastError", [tracked]);
  }
  #_lastError = (i(this, "_lastError"), void 0);
  _onStatusChange;
  _onError;
  constructor(options = {}) {
    const {
      flags,
      client,
      initStatus,
      initError,
      onStatusChange,
      onError
    } = options;
    this._client = client;
    this._initStatus = initStatus ?? (client ? 'initialized' : 'local');
    this._initError = initError;
    this._onStatusChange = onStatusChange;
    this._onError = onError;
    this.updateFlags(flags ?? {});
  }
  updateFlags(flags) {
    for (const [key, value] of Object.entries(flags)) {
      this._flags.set(key, value);
    }
  }
  replaceFlags(flags) {
    this._flags.clear();
    this.updateFlags(flags);
  }
  enable(key) {
    this._flags.set(key, true);
  }
  disable(key) {
    this._flags.set(key, false);
  }
  set(key, value) {
    this._flags.set(key, value);
  }
  get(key, defaultValue) {
    if (!this._flags.has(key) && defaultValue != null) {
      return defaultValue;
    }
    return this._flags.get(key);
  }
  persist() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.allFlags));
  }
  resetPersistence() {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  get allFlags() {
    const allFlags = {};
    for (const [key, value] of this._flags.entries()) {
      allFlags[key] = value;
    }
    return allFlags;
  }
  get isLocal() {
    return this.client == null;
  }

  /**
   * How initialization completed.
   *
   * - `'initialized'` — LD SDK initialized successfully.
   * - `'failed'`      — LD SDK failed to initialize (flags may be empty or from bootstrap).
   * - `'local'`       — Running in local mode.
   *
   * This property is reactive (`@tracked`). When the SDK recovers after a
   * failed init, it automatically transitions to `'initialized'`.
   */
  get initStatus() {
    return this._initStatus;
  }

  /**
   * Whether initialization completed successfully (status is `'initialized'` or `'local'`).
   */
  get initSucceeded() {
    return this._initStatus === 'initialized' || this._initStatus === 'local';
  }

  /**
   * The error from `waitForInitialization()` if initialization failed, otherwise `undefined`.
   */
  get initError() {
    return this._initError;
  }

  /**
   * Transition the init status. Fires `onStatusChange` if the status actually changed.
   * @internal
   */
  transitionStatus(newStatus, error) {
    const previous = this._initStatus;
    if (previous === newStatus) {
      return;
    }
    this._initStatus = newStatus;
    this._initError = error;
    this._onStatusChange?.(newStatus, previous);
  }

  /**
   * The most recent runtime error emitted by the LD SDK, or `undefined`.
   *
   * Reactive (`@tracked`) — templates and computed properties that read this
   * will automatically re-render when a new error arrives.
   */
  get lastError() {
    return this._lastError;
  }

  /**
   * Record a runtime error from the SDK's `'error'` event.
   * @internal
   */
  handleError(error) {
    this._lastError = error;
    this._onError?.(error);
  }

  // ---------------------------------------------------------------------------
  // Thin SDK passthroughs
  //
  // These delegate directly to the underlying LDClient. The addon's value-add
  // is the reactive flag layer above — these methods are here so consumers
  // don't need to reach into `context.client` for common operations.
  // ---------------------------------------------------------------------------

  /**
   * Like `variation()`, but includes the evaluation reason.
   *
   * Requires `evaluationReasons: true` in the initialization options.
   *
   * @see https://docs.launchdarkly.com/sdk/features/evaluation-reasons
   */
  variationDetail(key, defaultValue) {
    if (!this._client) {
      /* eslint-disable @typescript-eslint/no-unsafe-assignment */
      return {
        value: this.get(key, defaultValue),
        variationIndex: undefined,
        reason: undefined
      };
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    }
    return this._client.variationDetail(key, defaultValue);
  }

  /**
   * Send a custom event to LaunchDarkly for Experimentation metrics.
   *
   * No-op in local mode.
   *
   * @see https://docs.launchdarkly.com/sdk/features/events
   */
  track(key, data, metricValue) {
    this._client?.track(key, data, metricValue);
  }

  /**
   * Flush pending analytics events to LaunchDarkly without closing the client.
   *
   * Useful before a page navigation in an SPA to ensure events are delivered.
   *
   * No-op in local mode.
   *
   * @see https://docs.launchdarkly.com/sdk/features/flush
   */
  async flush() {
    await this._client?.flush();
  }

  /**
   * Shut down the LD client, release resources, and flush pending events.
   *
   * When `force` is `true`, the client is closed without waiting for the
   * pending event flush to complete. This is useful when the LD endpoint
   * is unresponsive and `await close()` would hang.
   *
   * After calling this, the context should not be used. Typically called
   * during application teardown or in test cleanup.
   */
  async close({
    force = false
  } = {}) {
    if (!this._client) {
      return;
    }
    if (force) {
      // Fire-and-forget — don't await the flush that close() triggers.
      void this._client.close();
    } else {
      await this._client.close();
    }
  }

  /**
   * Shut down the LD client and remove this context from the global state,
   * allowing `initialize()` to be called again.
   *
   * This is the recommended way to handle a failed initialization when you
   * want to fall back to local mode:
   *
   * ```ts
   * const result = await initialize(clientSideId, user, options);
   * if (!result.isOk) {
   *   await result.context.destroy();
   *   await initialize(clientSideId, user, { mode: 'local', localFlags: DEFAULTS });
   * }
   * ```
   *
   * Pass `{ force: true }` when the endpoint is unresponsive to avoid
   * hanging on the pending flush.
   */
  async destroy({
    force = false
  } = {}) {
    await this.close({
      force
    });
    removeCurrentContext();
  }
  get persisted() {
    const persisted = window.localStorage.getItem(STORAGE_KEY);
    return persisted ? JSON.parse(persisted) : undefined;
  }
  get client() {
    return this._client;
  }
  get user() {
    if (this.isLocal) {
      return {
        key: 'local-mode-no-user-specified'
      };
    }
    if (this.client) {
      return this.client.getContext();
    }
    return {
      key: 'unknown-user'
    };
  }
}

export { Context as default, getCurrentContext, removeCurrentContext, setCurrentContext, setPersistedFlags };
//# sourceMappingURL=context.js.map
