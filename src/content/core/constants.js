'use strict';

// Single global namespace for all content script modules.
// Every subsequent file attaches its module here.
globalThis.WTTRX = globalThis.WTTRX || {};

Object.assign(globalThis.WTTRX, {
  VERSION: '0.1.0',

  // Set to false before committing stable builds
  DEBUG: true,

  ACTIONS: Object.freeze({
    PING: 'PING',
    START_AUTOMATION: 'START_AUTOMATION',
    STOP_AUTOMATION: 'STOP_AUTOMATION',
    GET_STATUS: 'GET_STATUS',
    SAVE_CONFIG: 'SAVE_CONFIG',
    GET_CONFIG: 'GET_CONFIG',
  }),

  STATES: Object.freeze({
    IDLE: 'IDLE',
    RUNNING: 'RUNNING',
    PAUSED: 'PAUSED',
    ERROR: 'ERROR',
  }),

  // Status of each exam item detected in the pending list
  EXAM_STATUS: Object.freeze({
    PENDING_RED: 'PENDING_RED',   // red + "?" — needs association
    LOADING: 'LOADING',           // time/spinner — skip, retry later
    YELLOW: 'YELLOW',             // yellow — needs release
    DONE: 'DONE',
    UNKNOWN: 'UNKNOWN',
  }),

  QUEUE_EVENTS: Object.freeze({
    ITEM_ADDED: 'QUEUE_ITEM_ADDED',
    ITEM_PROCESSED: 'QUEUE_ITEM_PROCESSED',
    ITEM_FAILED: 'QUEUE_ITEM_FAILED',
    QUEUE_EMPTY: 'QUEUE_EMPTY',
  }),

  STORAGE_KEYS: Object.freeze({
    CONFIG: 'wttrx_config',
    SESSION_STATE: 'wttrx_session_state',
    LAST_ERROR: 'wttrx_last_error',
    STATS_TODAY: 'wttrx_stats_today',
  }),

  // z-index registry — document here to prevent future conflicts
  Z_INDEX: Object.freeze({
    OVERLAY_HOST: 999990,
    STATUS_BADGE: 999991,
    TOOLTIP: 999992,
  }),

  QUEUE_ITEM_TYPES: Object.freeze({
    ASSOCIATE_EXAM: 'ASSOCIATE_EXAM',
    RELEASE_YELLOW: 'RELEASE_YELLOW',
  }),
});
