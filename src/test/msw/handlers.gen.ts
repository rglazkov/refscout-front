// Generated from contract/refscout-api.yaml by scripts/generate-mocks.mjs.
// Hand edits are lost on the next generation: change the contract instead.

import { http, HttpResponse } from "msw";

/** Every response the contract spells out, ugly cases included, keyed by example name. */
export const scenarios = {
  submitJob: {
    accepted: {
      status: 202,
      body: {
        "jobId": "6d0b8b41-2f7a-4c1e-b3d9-0a5c7e2f9481",
        "jobToken": "jt_9Qp2vK7sYbN4tR8mL0xJcW3hZ6dF1aQe",
        "createdAt": "2026-08-24T09:41:07Z",
        "entitlements": {
          "role": "paid",
          "access": true,
          "periodEndsAt": "2026-08-25T00:00:00Z",
          "modules": {
            "bibcheck": {
              "allowed": true
            },
            "glossary": {
              "allowed": true
            },
            "presubmit": {
              "allowed": true
            },
            "cite": {
              "allowed": true
            }
          }
        }
      },
    },
    idempotentReplay: {
      status: 200,
      body: {
        "jobId": "6d0b8b41-2f7a-4c1e-b3d9-0a5c7e2f9481",
        "jobToken": "jt_9Qp2vK7sYbN4tR8mL0xJcW3hZ6dF1aQe",
        "createdAt": "2026-08-24T09:41:07Z",
        "entitlements": {
          "role": "paid",
          "access": true,
          "periodEndsAt": "2026-08-25T00:00:00Z",
          "modules": {
            "bibcheck": {
              "allowed": true
            },
            "glossary": {
              "allowed": true
            },
            "presubmit": {
              "allowed": true
            },
            "cite": {
              "allowed": true
            }
          }
        }
      },
    },
    schemaInvalid: {
      status: 400,
      body: {
        "error": {
          "code": "SCHEMA_INVALID",
          "requestId": "req_01J8Z3K4M5",
          "field": "documents[0].textSha256",
          "message": "Expected a 64-character lowercase hex digest."
        }
      },
    },
    authRequired: {
      status: 401,
      body: {
        "error": {
          "code": "AUTH_REQUIRED",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    accessClosed: {
      status: 402,
      body: {
        "error": {
          "code": "ACCESS_CLOSED",
          "requestId": "req_01J8Z3K4M5",
          "params": {
            "module": "cite"
          }
        }
      },
    },
    csrfInvalid: {
      status: 403,
      body: {
        "error": {
          "code": "CSRF_INVALID",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    docTooLarge: {
      status: 413,
      body: {
        "error": {
          "code": "DOC_TOO_LARGE",
          "requestId": "req_01J8Z3K4M5",
          "params": {
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "cpLength": 4210553,
            "limit": 3000000
          }
        }
      },
    },
    unsupportedEncoding: {
      status: 415,
      body: {
        "error": {
          "code": "UNSUPPORTED_ENCODING",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    keyReuse: {
      status: 422,
      body: {
        "error": {
          "code": "IDEMPOTENCY_KEY_REUSE",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    serviceUnavailable: {
      status: 503,
      body: {
        "error": {
          "code": "SERVICE_UNAVAILABLE",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 15
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  getJob: {
    finished: {
      status: 200,
      body: {
        "id": "6d0b8b41-2f7a-4c1e-b3d9-0a5c7e2f9481",
        "createdAt": "2026-08-24T09:41:07Z",
        "state": "finished",
        "stages": [
          {
            "id": "accepted",
            "labelKey": "stage.accepted",
            "labelParams": {
              "documents": 2,
              "characters": 225491
            },
            "state": "done",
            "startedAt": "2026-08-24T09:41:07Z",
            "finishedAt": "2026-08-24T09:41:07Z"
          },
          {
            "id": "bibcheck:a71b0c39",
            "labelKey": "stage.bibcheck",
            "docId": "a71b0c39-4e52-4bb1-9c02-6f8d3a1e5c77",
            "state": "done",
            "startedAt": "2026-08-24T09:41:09Z",
            "finishedAt": "2026-08-24T09:41:31Z",
            "progress": {
              "done": 47,
              "total": 47
            }
          },
          {
            "id": "presubmit:0f2c1d64",
            "labelKey": "stage.presubmit",
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "state": "done",
            "startedAt": "2026-08-24T09:41:07Z",
            "finishedAt": "2026-08-24T09:41:16Z"
          },
          {
            "id": "cite:0f2c1d64",
            "labelKey": "stage.cite",
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "state": "done",
            "startedAt": "2026-08-24T09:41:16Z",
            "finishedAt": "2026-08-24T09:42:04Z"
          }
        ],
        "documents": [
          {
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "name": "paper_v7.pdf",
            "role": "manuscript",
            "textSha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
            "cpLength": 184203,
            "modules": {
              "bibcheck": {
                "state": "ok",
                "attempt": 1,
                "score": 64,
                "counts": {
                  "critical": 1,
                  "warning": 1,
                  "info": 0
                },
                "headlineKey": "bibcheck.retracted_entry",
                "resultRef": "/jobs/6d0b8b41-2f7a-4c1e-b3d9-0a5c7e2f9481/documents/0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31/modules/bibcheck/result",
                "finishedAt": "2026-08-24T09:41:31Z"
              },
              "presubmit": {
                "state": "ok",
                "attempt": 1,
                "score": 78,
                "counts": {
                  "critical": 0,
                  "warning": 2,
                  "info": 0
                },
                "headlineKey": "presubmit.author_repo_link",
                "resultRef": "/jobs/6d0b8b41-2f7a-4c1e-b3d9-0a5c7e2f9481/documents/0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31/modules/presubmit/result",
                "finishedAt": "2026-08-24T09:41:16Z"
              },
              "cite": {
                "state": "ok",
                "attempt": 1,
                "score": null,
                "counts": {
                  "critical": 0,
                  "warning": 0,
                  "info": 1
                },
                "resultRef": "/jobs/6d0b8b41-2f7a-4c1e-b3d9-0a5c7e2f9481/documents/0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31/modules/cite/result",
                "finishedAt": "2026-08-24T09:42:04Z"
              }
            }
          },
          {
            "docId": "a71b0c39-4e52-4bb1-9c02-6f8d3a1e5c77",
            "name": "refs.bib",
            "role": "bibliography",
            "textSha256": "b1946ac92492d2347c6235b4d2611184b1946ac92492d2347c6235b4d2611184",
            "cpLength": 41288,
            "modules": {
              "bibcheck": {
                "state": "ok",
                "attempt": 1,
                "score": 71,
                "counts": {
                  "critical": 1,
                  "warning": 3,
                  "info": 2
                },
                "headlineKey": "bibcheck.retracted_entry",
                "resultRef": "/jobs/6d0b8b41-2f7a-4c1e-b3d9-0a5c7e2f9481/documents/a71b0c39-4e52-4bb1-9c02-6f8d3a1e5c77/modules/bibcheck/result",
                "finishedAt": "2026-08-24T09:41:31Z"
              }
            }
          }
        ]
      },
    },
    running: {
      status: 200,
      body: {
        "id": "6d0b8b41-2f7a-4c1e-b3d9-0a5c7e2f9481",
        "createdAt": "2026-08-24T09:41:07Z",
        "state": "running",
        "pollAfterMs": 2000,
        "stages": [
          {
            "id": "accepted",
            "labelKey": "stage.accepted",
            "labelParams": {
              "documents": 2,
              "characters": 225491
            },
            "state": "done",
            "startedAt": "2026-08-24T09:41:07Z",
            "finishedAt": "2026-08-24T09:41:07Z"
          },
          {
            "id": "bibcheck:a71b0c39",
            "labelKey": "stage.bibcheck",
            "docId": "a71b0c39-4e52-4bb1-9c02-6f8d3a1e5c77",
            "state": "running",
            "startedAt": "2026-08-24T09:41:09Z",
            "progress": {
              "done": 31,
              "total": 47
            },
            "detailKey": "stage.bibcheck.crossref",
            "detailParams": {
              "databases": 2
            }
          },
          {
            "id": "presubmit:0f2c1d64",
            "labelKey": "stage.presubmit",
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "state": "done",
            "startedAt": "2026-08-24T09:41:07Z",
            "finishedAt": "2026-08-24T09:41:16Z",
            "detailKey": "stage.presubmit.done",
            "detailParams": {
              "issues": 2
            }
          },
          {
            "id": "cite:0f2c1d64",
            "labelKey": "stage.cite",
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "state": "pending"
          }
        ],
        "documents": [
          {
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "name": "paper_v7.pdf",
            "role": "manuscript",
            "textSha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
            "cpLength": 184203,
            "modules": {
              "presubmit": {
                "state": "ok",
                "attempt": 1,
                "score": 78,
                "counts": {
                  "critical": 0,
                  "warning": 2,
                  "info": 0
                },
                "headlineKey": "presubmit.author_repo_link",
                "resultRef": "/jobs/6d0b8b41-2f7a-4c1e-b3d9-0a5c7e2f9481/documents/0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31/modules/presubmit/result",
                "finishedAt": "2026-08-24T09:41:16Z"
              },
              "cite": {
                "state": "queued",
                "attempt": 1,
                "score": null,
                "counts": {
                  "critical": 0,
                  "warning": 0,
                  "info": 0
                }
              },
              "bibcheck": {
                "state": "running",
                "attempt": 1,
                "score": null,
                "counts": {
                  "critical": 0,
                  "warning": 0,
                  "info": 0
                }
              }
            }
          },
          {
            "docId": "a71b0c39-4e52-4bb1-9c02-6f8d3a1e5c77",
            "name": "refs.bib",
            "role": "bibliography",
            "textSha256": "b1946ac92492d2347c6235b4d2611184b1946ac92492d2347c6235b4d2611184",
            "cpLength": 41288,
            "modules": {
              "bibcheck": {
                "state": "running",
                "attempt": 1,
                "score": null,
                "counts": {
                  "critical": 0,
                  "warning": 0,
                  "info": 0
                }
              }
            }
          }
        ]
      },
    },
    partial: {
      status: 200,
      body: {
        "id": "6d0b8b41-2f7a-4c1e-b3d9-0a5c7e2f9481",
        "createdAt": "2026-08-24T09:41:07Z",
        "state": "partial",
        "stages": [
          {
            "id": "accepted",
            "labelKey": "stage.accepted",
            "labelParams": {
              "documents": 1,
              "characters": 184203
            },
            "state": "done",
            "startedAt": "2026-08-24T09:41:07Z",
            "finishedAt": "2026-08-24T09:41:07Z"
          },
          {
            "id": "bibcheck:0f2c1d64",
            "labelKey": "stage.bibcheck",
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "state": "done",
            "startedAt": "2026-08-24T09:41:09Z",
            "finishedAt": "2026-08-24T09:41:31Z"
          },
          {
            "id": "glossary:0f2c1d64",
            "labelKey": "stage.glossary",
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "state": "skipped",
            "startedAt": "2026-08-24T09:41:31Z",
            "finishedAt": "2026-08-24T09:41:32Z"
          },
          {
            "id": "cite:0f2c1d64",
            "labelKey": "stage.cite",
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "state": "error",
            "startedAt": "2026-08-24T09:41:32Z",
            "finishedAt": "2026-08-24T09:43:32Z"
          }
        ],
        "documents": [
          {
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "name": "paper_v7.pdf",
            "role": "manuscript",
            "textSha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
            "cpLength": 184203,
            "modules": {
              "bibcheck": {
                "state": "ok",
                "attempt": 1,
                "score": 64,
                "counts": {
                  "critical": 1,
                  "warning": 1,
                  "info": 0
                },
                "headlineKey": "bibcheck.retracted_entry",
                "resultRef": "/jobs/6d0b8b41-2f7a-4c1e-b3d9-0a5c7e2f9481/documents/0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31/modules/bibcheck/result",
                "finishedAt": "2026-08-24T09:41:31Z"
              },
              "glossary": {
                "state": "skipped",
                "attempt": 1,
                "score": null,
                "counts": {
                  "critical": 0,
                  "warning": 0,
                  "info": 0
                },
                "skippedReasonKey": "glossary.skipped.no_acronyms",
                "finishedAt": "2026-08-24T09:41:32Z"
              },
              "cite": {
                "state": "error",
                "attempt": 1,
                "score": null,
                "counts": {
                  "critical": 0,
                  "warning": 0,
                  "info": 0
                },
                "errorCode": "LLM_UNAVAILABLE",
                "finishedAt": "2026-08-24T09:43:32Z"
              }
            }
          }
        ]
      },
    },
    failed: {
      status: 200,
      body: {
        "id": "6d0b8b41-2f7a-4c1e-b3d9-0a5c7e2f9481",
        "createdAt": "2026-08-24T09:41:07Z",
        "state": "failed",
        "stages": [
          {
            "id": "accepted",
            "labelKey": "stage.accepted",
            "labelParams": {
              "documents": 1,
              "characters": 184203
            },
            "state": "done",
            "startedAt": "2026-08-24T09:41:07Z",
            "finishedAt": "2026-08-24T09:41:07Z"
          },
          {
            "id": "bibcheck:0f2c1d64",
            "labelKey": "stage.bibcheck",
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "state": "error",
            "startedAt": "2026-08-24T09:41:09Z",
            "finishedAt": "2026-08-24T09:44:09Z"
          }
        ],
        "documents": [
          {
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "name": "paper_v7.pdf",
            "role": "manuscript",
            "textSha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
            "cpLength": 184203,
            "modules": {
              "bibcheck": {
                "state": "error",
                "attempt": 1,
                "score": null,
                "counts": {
                  "critical": 0,
                  "warning": 0,
                  "info": 0
                },
                "errorCode": "UPSTREAM_UNAVAILABLE",
                "finishedAt": "2026-08-24T09:44:09Z"
              }
            }
          }
        ]
      },
    },
    jobNotFound: {
      status: 404,
      body: {
        "error": {
          "code": "JOB_NOT_FOUND",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  cancelJob: {
    cancelled: {
      status: 202,
      body: {
        "id": "6d0b8b41-2f7a-4c1e-b3d9-0a5c7e2f9481",
        "createdAt": "2026-08-24T09:41:07Z",
        "state": "cancelled",
        "stages": [
          {
            "id": "accepted",
            "labelKey": "stage.accepted",
            "labelParams": {
              "documents": 1,
              "characters": 184203
            },
            "state": "done",
            "startedAt": "2026-08-24T09:41:07Z",
            "finishedAt": "2026-08-24T09:41:07Z"
          },
          {
            "id": "bibcheck:0f2c1d64",
            "labelKey": "stage.bibcheck",
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "state": "skipped",
            "startedAt": "2026-08-24T09:41:09Z",
            "finishedAt": "2026-08-24T09:41:22Z"
          }
        ],
        "documents": [
          {
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "name": "paper_v7.pdf",
            "role": "manuscript",
            "textSha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
            "cpLength": 184203,
            "modules": {
              "bibcheck": {
                "state": "queued",
                "attempt": 1,
                "score": null,
                "counts": {
                  "critical": 0,
                  "warning": 0,
                  "info": 0
                }
              }
            }
          }
        ]
      },
    },
    jobNotFound: {
      status: 404,
      body: {
        "error": {
          "code": "JOB_NOT_FOUND",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    notRetryable: {
      status: 409,
      body: {
        "error": {
          "code": "MODULE_NOT_RETRYABLE",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  getModuleResult: {
    bibcheck: {
      status: 200,
      body: {
        "module": "bibcheck",
        "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
        "attempt": 1,
        "offsetUnit": "codepoints",
        "texts": [
          {
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "textSha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
            "cpLength": 184203
          },
          {
            "docId": "a71b0c39-4e52-4bb1-9c02-6f8d3a1e5c77",
            "textSha256": "b1946ac92492d2347c6235b4d2611184b1946ac92492d2347c6235b4d2611184",
            "cpLength": 41288
          }
        ],
        "issues": [
          {
            "issueId": "iss_1",
            "code": "RETRACTED_ENTRY",
            "severity": "critical",
            "titleKey": "bibcheck.retracted_entry",
            "params": {
              "retractedOn": "2024-03-11"
            },
            "detail": "The article was retracted by the publisher after concerns about image duplication.",
            "anchors": [
              {
                "kind": "bibkey",
                "docId": "a71b0c39-4e52-4bb1-9c02-6f8d3a1e5c77",
                "bibkey": "smith2019attention"
              },
              {
                "kind": "range",
                "from": 12045,
                "to": 12062,
                "quote": "Smith et al. [22]",
                "prefix": "as shown by ",
                "suffix": ". We extend"
              },
              {
                "kind": "range",
                "from": 38110,
                "to": 38127,
                "quote": "Smith et al. [22]",
                "prefix": "unlike ",
                "suffix": ", our data"
              }
            ],
            "evidence": [
              {
                "kind": "doi",
                "value": "10.1000/xyz123"
              },
              {
                "kind": "date",
                "labelKey": "evidence.retracted_on",
                "value": "2024-03-11"
              },
              {
                "kind": "source",
                "labelKey": "evidence.retraction_watch",
                "title": "Retraction Watch Database",
                "url": "https://retractiondatabase.org/records/10.1000/xyz123"
              }
            ],
            "actions": [
              {
                "kind": "openSource",
                "url": "https://doi.org/10.1000/xyz123"
              },
              {
                "kind": "download",
                "labelKey": "action.download_bibliography",
                "artifact": 0
              }
            ]
          },
          {
            "issueId": "iss_2",
            "code": "UNCITED_SOURCE",
            "severity": "warning",
            "titleKey": "bibcheck.uncited_source",
            "params": {
              "key": "jones2021"
            },
            "anchors": [
              {
                "kind": "bibkey",
                "docId": "a71b0c39-4e52-4bb1-9c02-6f8d3a1e5c77",
                "bibkey": "jones2021"
              }
            ]
          }
        ],
        "artifacts": [
          {
            "kind": "bib",
            "labelKey": "artifact.corrected_bibliography",
            "content": "@article{smith2019a,\n  title = {Attention Revisited}\n}\n"
          }
        ]
      },
    },
    presubmit: {
      status: 200,
      body: {
        "module": "presubmit",
        "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
        "attempt": 1,
        "offsetUnit": "codepoints",
        "texts": [
          {
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "textSha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
            "cpLength": 184203
          }
        ],
        "issues": [
          {
            "issueId": "3f1c0a77-5b21-4de6-9a02-7c4e18b3d590",
            "code": "PRESUBMIT_AUTHOR_IN_METADATA",
            "severity": "critical",
            "titleKey": "presubmit.author_in_metadata",
            "params": {
              "field": "Author"
            },
            "detail": "The file properties still carry the author's name, which a blind review must not see.",
            "anchors": [
              {
                "kind": "document",
                "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31"
              }
            ],
            "evidence": [
              {
                "kind": "text",
                "labelKey": "evidence.metadata_field",
                "value": "Author: Jane Smith"
              }
            ],
            "actions": [
              {
                "kind": "copy",
                "value": "Author: Jane Smith"
              }
            ]
          },
          {
            "issueId": "8a2d4e13-90bc-4f77-b6a1-2e5c0d9f3b48",
            "code": "PRESUBMIT_AUTHOR_REPO_LINK",
            "severity": "warning",
            "titleKey": "presubmit.author_repo_link",
            "params": {
              "host": "github.com"
            },
            "anchors": [
              {
                "kind": "range",
                "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
                "from": 31980,
                "to": 32021,
                "quote": "https://github.com/jsmith/dense-retrieval"
              }
            ]
          }
        ],
        "artifacts": [
          {
            "kind": "md",
            "labelKey": "artifact.submission_checklist",
            "content": "# Before you submit\n\n- [ ] Remove the author name from the file properties\n- [ ] Replace the repository link with an anonymised one\n"
          }
        ]
      },
    },
    glossary: {
      status: 200,
      body: {
        "module": "glossary",
        "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
        "attempt": 1,
        "offsetUnit": "codepoints",
        "texts": [
          {
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "textSha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
            "cpLength": 184203
          }
        ],
        "issues": [
          {
            "issueId": "c40b7e29-1d83-4a56-8f0e-9b7d2c614a3f",
            "code": "GLOSSARY_UNDEFINED_ACRONYM",
            "severity": "warning",
            "titleKey": "glossary.undefined_acronym",
            "params": {
              "acronym": "MRR"
            },
            "anchors": [
              {
                "kind": "range",
                "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
                "from": 44120,
                "to": 44123,
                "quote": "MRR"
              }
            ],
            "evidence": [
              {
                "kind": "number",
                "labelKey": "evidence.occurrences",
                "value": 14
              }
            ],
            "actions": []
          }
        ],
        "artifacts": [
          {
            "kind": "tex",
            "labelKey": "artifact.generated_glossary",
            "content": "\\newacronym{mrr}{MRR}{mean reciprocal rank}\n"
          }
        ]
      },
    },
    cite: {
      status: 200,
      body: {
        "module": "cite",
        "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
        "attempt": 1,
        "offsetUnit": "codepoints",
        "texts": [
          {
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "textSha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
            "cpLength": 184203
          }
        ],
        "issues": [
          {
            "issueId": "cl_7",
            "code": "CLAIM_NEEDS_SOURCE",
            "severity": "info",
            "titleKey": "cite.claim_needs_source",
            "anchors": [
              {
                "kind": "range",
                "from": 20114,
                "to": 20199,
                "quote": "Transformer models outperform recurrent architectures on long-range dependency tasks.",
                "prefix": "In particular, ",
                "suffix": " This has been"
              }
            ],
            "cite": {
              "query": "transformer long-range dependency recurrent comparison",
              "candidates": [
                {
                  "candidateId": "cand_1",
                  "title": "Attention Is All You Need",
                  "authors": [
                    "Vaswani, A.",
                    "Shazeer, N."
                  ],
                  "year": 2017,
                  "venue": "NeurIPS",
                  "citedBy": 112340,
                  "doi": "10.48550/arXiv.1706.03762",
                  "url": "https://arxiv.org/abs/1706.03762",
                  "openAccess": true,
                  "sources": [
                    "arxiv",
                    "semanticscholar",
                    "openalex"
                  ],
                  "relevance": 0.94,
                  "alreadyCited": true,
                  "lowRelevance": false
                },
                {
                  "candidateId": "cand_2",
                  "title": "Long Range Arena: A Benchmark for Efficient Transformers",
                  "authors": [
                    "Tay, Y.",
                    "Dehghani, M."
                  ],
                  "year": 2021,
                  "venue": "ICLR",
                  "citedBy": 1180,
                  "doi": "10.48550/arXiv.2011.04006",
                  "openAccess": true,
                  "sources": [
                    "arxiv",
                    "openalex"
                  ],
                  "relevance": 0.88,
                  "alreadyCited": false,
                  "lowRelevance": false
                },
                {
                  "candidateId": "cand_3",
                  "title": "On the Difficulty of Training Recurrent Neural Networks",
                  "authors": [
                    "Pascanu, R."
                  ],
                  "year": 2013,
                  "venue": "ICML",
                  "citedBy": 6420,
                  "openAccess": false,
                  "sources": [
                    "openalex"
                  ],
                  "relevance": 0.41,
                  "alreadyCited": false,
                  "lowRelevance": true
                }
              ]
            }
          }
        ]
      },
    },
    unknownKinds: {
      status: 200,
      body: {
        "module": "presubmit",
        "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
        "attempt": 1,
        "offsetUnit": "codepoints",
        "texts": [
          {
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "textSha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
            "cpLength": 184203
          }
        ],
        "issues": [
          {
            "issueId": "iss_9",
            "code": "AUTHOR_REPO_LINK",
            "severity": "warning",
            "titleKey": "presubmit.author_repo_link",
            "anchors": [
              {
                "kind": "sidenote",
                "sidenoteId": "sn_3"
              },
              {
                "kind": "range",
                "from": 4021,
                "to": 4058,
                "quote": "https://github.com/jsmith/thesis-code",
                "prefix": "available at ",
                "suffix": " (accessed"
              }
            ],
            "evidence": [
              {
                "kind": "confidence",
                "score": 0.72
              },
              {
                "kind": "text",
                "labelKey": "evidence.matched_name",
                "value": "jsmith"
              }
            ],
            "actions": [
              {
                "kind": "explain",
                "promptId": "p_11"
              },
              {
                "kind": "copy",
                "labelKey": "action.copy_url",
                "value": "https://github.com/jsmith/thesis-code"
              }
            ]
          }
        ]
      },
    },
    jobNotFound: {
      status: 404,
      body: {
        "error": {
          "code": "JOB_NOT_FOUND",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    resultNotReady: {
      status: 409,
      body: {
        "error": {
          "code": "RESULT_NOT_READY",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    resultSuperseded: {
      status: 410,
      body: {
        "error": {
          "code": "RESULT_SUPERSEDED",
          "requestId": "req_01J8Z3K4M5",
          "params": {
            "attempt": 1
          }
        }
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  retryModule: {
    retrying: {
      status: 202,
      body: {
        "id": "6d0b8b41-2f7a-4c1e-b3d9-0a5c7e2f9481",
        "createdAt": "2026-08-24T09:41:07Z",
        "state": "running",
        "pollAfterMs": 2000,
        "stages": [
          {
            "id": "accepted",
            "labelKey": "stage.accepted",
            "labelParams": {
              "documents": 1,
              "characters": 184203
            },
            "state": "done",
            "startedAt": "2026-08-24T09:41:07Z",
            "finishedAt": "2026-08-24T09:41:07Z"
          },
          {
            "id": "bibcheck:0f2c1d64",
            "labelKey": "stage.bibcheck",
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "state": "done",
            "startedAt": "2026-08-24T09:41:09Z",
            "finishedAt": "2026-08-24T09:41:31Z"
          },
          {
            "id": "cite:0f2c1d64",
            "labelKey": "stage.cite",
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "state": "running",
            "startedAt": "2026-08-24T09:45:02Z"
          }
        ],
        "documents": [
          {
            "docId": "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
            "name": "paper_v7.pdf",
            "role": "manuscript",
            "textSha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
            "cpLength": 184203,
            "modules": {
              "bibcheck": {
                "state": "ok",
                "attempt": 1,
                "score": 64,
                "counts": {
                  "critical": 1,
                  "warning": 1,
                  "info": 0
                },
                "resultRef": "/jobs/6d0b8b41-2f7a-4c1e-b3d9-0a5c7e2f9481/documents/0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31/modules/bibcheck/result",
                "finishedAt": "2026-08-24T09:41:31Z"
              },
              "cite": {
                "state": "running",
                "attempt": 2,
                "score": null,
                "counts": {
                  "critical": 0,
                  "warning": 0,
                  "info": 0
                }
              }
            }
          }
        ]
      },
    },
    jobNotFound: {
      status: 404,
      body: {
        "error": {
          "code": "JOB_NOT_FOUND",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    notRetryable: {
      status: 409,
      body: {
        "error": {
          "code": "MODULE_NOT_RETRYABLE",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  streamJobEvents: {
    jobNotFound: {
      status: 404,
      body: {
        "error": {
          "code": "JOB_NOT_FOUND",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  getEntitlements: {
    anonymous: {
      status: 200,
      body: {
        "role": "anonymous",
        "access": false,
        "modules": {
          "bibcheck": {
            "allowed": true
          },
          "glossary": {
            "allowed": true
          },
          "presubmit": {
            "allowed": false,
            "lockReason": "requires-account"
          },
          "cite": {
            "allowed": false,
            "lockReason": "requires-account"
          }
        }
      },
    },
    trial: {
      status: 200,
      body: {
        "role": "free",
        "access": false,
        "modules": {
          "bibcheck": {
            "allowed": true
          },
          "glossary": {
            "allowed": true
          },
          "presubmit": {
            "allowed": true
          },
          "cite": {
            "allowed": true
          }
        }
      },
    },
    paid: {
      status: 200,
      body: {
        "role": "paid",
        "access": true,
        "periodEndsAt": "2026-08-25T00:00:00Z",
        "modules": {
          "bibcheck": {
            "allowed": true
          },
          "glossary": {
            "allowed": true
          },
          "presubmit": {
            "allowed": true
          },
          "cite": {
            "allowed": true
          }
        }
      },
    },
    periodEnded: {
      status: 200,
      body: {
        "role": "paid",
        "access": false,
        "modules": {
          "bibcheck": {
            "allowed": true
          },
          "glossary": {
            "allowed": true
          },
          "presubmit": {
            "allowed": false,
            "lockReason": "period-ended"
          },
          "cite": {
            "allowed": false,
            "lockReason": "period-ended"
          }
        }
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  scoutSearch: {
    results: {
      status: 200,
      body: {
        "results": [
          {
            "resultId": "res_1",
            "title": "Attention Is All You Need",
            "authors": [
              "Vaswani, A.",
              "Shazeer, N."
            ],
            "year": 2017,
            "venue": "NeurIPS",
            "citedBy": 112340,
            "doi": "10.48550/arXiv.1706.03762",
            "doiVerified": true,
            "url": "https://arxiv.org/abs/1706.03762",
            "openAccess": true,
            "sources": [
              "arxiv",
              "semanticscholar"
            ],
            "relevance": 0.96
          },
          {
            "resultId": "res_2",
            "title": "Long Range Arena: A Benchmark for Efficient Transformers",
            "authors": [
              "Tay, Y."
            ],
            "year": 2021,
            "venue": "ICLR",
            "citedBy": 1180,
            "openAccess": true,
            "sources": [
              "arxiv"
            ],
            "relevance": 0.81
          }
        ],
        "searchedSources": [
          "arxiv",
          "semanticscholar"
        ],
        "degraded": [
          "openalex"
        ]
      },
    },
    schemaInvalid: {
      status: 400,
      body: {
        "error": {
          "code": "SCHEMA_INVALID",
          "requestId": "req_01J8Z3K4M5",
          "field": "documents[0].textSha256",
          "message": "Expected a 64-character lowercase hex digest."
        }
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    serviceUnavailable: {
      status: 503,
      body: {
        "error": {
          "code": "SERVICE_UNAVAILABLE",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 15
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  scoutFeedback: {
    status204: {
      status: 204,
      body: null,
    },
    schemaInvalid: {
      status: 400,
      body: {
        "error": {
          "code": "SCHEMA_INVALID",
          "requestId": "req_01J8Z3K4M5",
          "field": "documents[0].textSha256",
          "message": "Expected a 64-character lowercase hex digest."
        }
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  fetchVenueRequirements: {
    ready: {
      status: 200,
      body: {
        "state": "ready",
        "title": "ACL 2026 Submission Guidelines",
        "text": "Papers must be anonymised. The main text is limited to eight pages, excluding references.",
        "fetchedAt": "2026-08-24T09:40:11Z"
      },
    },
    notRequirements: {
      status: 200,
      body: {
        "state": "not-requirements",
        "fetchedAt": "2026-08-24T09:40:11Z"
      },
    },
    schemaInvalid: {
      status: 400,
      body: {
        "error": {
          "code": "SCHEMA_INVALID",
          "requestId": "req_01J8Z3K4M5",
          "field": "documents[0].textSha256",
          "message": "Expected a 64-character lowercase hex digest."
        }
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unreadable: {
      status: 502,
      body: {
        "error": {
          "code": "VENUE_FETCH_FAILED",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    timeout: {
      status: 504,
      body: {
        "error": {
          "code": "VENUE_FETCH_TIMEOUT",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  sendClientEvents: {
    accepted: {
      status: 202,
      body: {
        "collect": "on",
        "reportId": "rep_01J8Z3K4M5"
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  reportCspViolation: {
    status204: {
      status: 204,
      body: null,
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  getSession: {
    anonymous: {
      status: 200,
      body: {
        "user": null,
        "csrfToken": "csrf_4b81c0f2a7d94e6b"
      },
    },
    signedIn: {
      status: 200,
      body: {
        "user": {
          "id": "usr_3f19",
          "email": "j.smith@example.edu",
          "name": "J. Smith",
          "createdAt": "2025-11-02T18:24:00Z"
        },
        "csrfToken": "csrf_4b81c0f2a7d94e6b"
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  register: {
    status204: {
      status: 204,
      body: null,
    },
    schemaInvalid: {
      status: 400,
      body: {
        "error": {
          "code": "SCHEMA_INVALID",
          "requestId": "req_01J8Z3K4M5",
          "field": "documents[0].textSha256",
          "message": "Expected a 64-character lowercase hex digest."
        }
      },
    },
    notRetryable: {
      status: 409,
      body: {
        "error": {
          "code": "MODULE_NOT_RETRYABLE",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  login: {
    status204: {
      status: 204,
      body: null,
    },
    authRequired: {
      status: 401,
      body: {
        "error": {
          "code": "AUTH_REQUIRED",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  logout: {
    status204: {
      status: 204,
      body: null,
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  forgotPassword: {
    status204: {
      status: 204,
      body: null,
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  resetPassword: {
    status204: {
      status: 204,
      body: null,
    },
    schemaInvalid: {
      status: 400,
      body: {
        "error": {
          "code": "SCHEMA_INVALID",
          "requestId": "req_01J8Z3K4M5",
          "field": "documents[0].textSha256",
          "message": "Expected a 64-character lowercase hex digest."
        }
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  startOauth: {
    status302: {
      status: 302,
      body: null,
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  completeOauth: {
    status302: {
      status: 302,
      body: null,
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  exportAccountData: {
    export: {
      status: 200,
      body: {
        "account": {
          "id": "usr_3f19",
          "email": "j.smith@example.edu",
          "createdAt": "2025-11-02T18:24:00Z"
        },
        "jobs": [
          {
            "jobId": "6d0b8b41-2f7a-4c1e-b3d9-0a5c7e2f9481",
            "createdAt": "2026-08-24T09:41:07Z",
            "state": "finished"
          }
        ]
      },
    },
    authRequired: {
      status: 401,
      body: {
        "error": {
          "code": "AUTH_REQUIRED",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  deleteAccount: {
    status204: {
      status: 204,
      body: null,
    },
    authRequired: {
      status: 401,
      body: {
        "error": {
          "code": "AUTH_REQUIRED",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  startCheckout: {
    redirect: {
      status: 200,
      body: {
        "url": "https://billing.example.com/session/cs_test_a1b2c3"
      },
    },
    authRequired: {
      status: 401,
      body: {
        "error": {
          "code": "AUTH_REQUIRED",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  openBillingPortal: {
    redirect: {
      status: 200,
      body: {
        "url": "https://billing.example.com/session/cs_test_a1b2c3"
      },
    },
    authRequired: {
      status: 401,
      body: {
        "error": {
          "code": "AUTH_REQUIRED",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
  health: {
    ok: {
      status: 200,
      body: {
        "status": "ok",
        "release": "2026.08.24-1"
      },
    },
    rateLimited: {
      status: 429,
      body: {
        "error": {
          "code": "RATE_LIMITED",
          "requestId": "req_01J8Z3K4M5",
          "retryAfterSec": 30
        }
      },
    },
    unexpected: {
      status: 500,
      body: {
        "error": {
          "code": "INTERNAL_ERROR",
          "requestId": "req_01J8Z3K4M5"
        }
      },
    },
  },
} as const;

/** The happy path: the first successful response of each operation. */
export const handlers = [
  http.post("*/jobs", () =>
    HttpResponse.json(scenarios.submitJob.accepted.body, { status: 202 }),
  ),
  http.get("*/jobs/:jobId", () =>
    HttpResponse.json(scenarios.getJob.finished.body, { status: 200 }),
  ),
  http.delete("*/jobs/:jobId", () =>
    HttpResponse.json(scenarios.cancelJob.cancelled.body, { status: 202 }),
  ),
  http.get("*/jobs/:jobId/documents/:docId/modules/:moduleId/result", () =>
    HttpResponse.json(scenarios.getModuleResult.bibcheck.body, { status: 200 }),
  ),
  http.post("*/jobs/:jobId/modules/:moduleId/retry", () =>
    HttpResponse.json(scenarios.retryModule.retrying.body, { status: 202 }),
  ),
  http.get("*/entitlements", () =>
    HttpResponse.json(scenarios.getEntitlements.anonymous.body, { status: 200 }),
  ),
  http.post("*/scout/search", () =>
    HttpResponse.json(scenarios.scoutSearch.results.body, { status: 200 }),
  ),
  http.post("*/scout/feedback", () =>
    new HttpResponse(null, { status: 204 }),
  ),
  http.post("*/venues/fetch", () =>
    HttpResponse.json(scenarios.fetchVenueRequirements.ready.body, { status: 200 }),
  ),
  http.post("*/client-events", () =>
    HttpResponse.json(scenarios.sendClientEvents.accepted.body, { status: 202 }),
  ),
  http.post("*/csp-report", () =>
    new HttpResponse(null, { status: 204 }),
  ),
  http.get("*/auth/session", () =>
    HttpResponse.json(scenarios.getSession.anonymous.body, { status: 200 }),
  ),
  http.post("*/auth/register", () =>
    new HttpResponse(null, { status: 204 }),
  ),
  http.post("*/auth/login", () =>
    new HttpResponse(null, { status: 204 }),
  ),
  http.post("*/auth/logout", () =>
    new HttpResponse(null, { status: 204 }),
  ),
  http.post("*/auth/password/forgot", () =>
    new HttpResponse(null, { status: 204 }),
  ),
  http.post("*/auth/password/reset", () =>
    new HttpResponse(null, { status: 204 }),
  ),
  http.get("*/auth/oauth/:provider/start", () =>
    new HttpResponse(null, { status: 302 }),
  ),
  http.get("*/auth/oauth/:provider/callback", () =>
    new HttpResponse(null, { status: 302 }),
  ),
  http.get("*/account/export", () =>
    HttpResponse.json(scenarios.exportAccountData.export.body, { status: 200 }),
  ),
  http.post("*/account/delete", () =>
    new HttpResponse(null, { status: 204 }),
  ),
  http.post("*/billing/checkout", () =>
    HttpResponse.json(scenarios.startCheckout.redirect.body, { status: 200 }),
  ),
  http.get("*/billing/portal", () =>
    HttpResponse.json(scenarios.openBillingPortal.redirect.body, { status: 200 }),
  ),
  http.get("*/health", () =>
    HttpResponse.json(scenarios.health.ok.body, { status: 200 }),
  ),
];
