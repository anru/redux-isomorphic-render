'use strict';

import isPromise from 'is-promise';

export default function reduxIsomorphicRender(...middlewares) {
  return function (next) {
    return function (reducer, initialState) {
      const store = next(reducer, initialState);
      let dispatch = store.dispatch;

      let pending = 0, onComplete;
      let firstError;

      function handleWaitingOnMiddleware(middleware) {
        return action => {
          let result = middleware(action);
          if (isPromise(result)) {
            pending++;
            result = result.then(function () {
              pending--;
              if (pending === 0 && onComplete) onComplete();
            }, function (err) {
              if (!firstError) firstError = err;
              pending--;
              if (pending === 0 && onComplete) onComplete();
              throw err;
            });
          }
          return result;
        }
      }
      const middlewareAPI = {
        getState: store.getState,
        dispatch: (action) => dispatch(action)
      };

      const chain = middlewares.map(
        middleware => middleware(middlewareAPI)
      ).map(
        middleware => next => handleWaitingOnMiddleware(middleware(next))
      );
      dispatch = compose(...chain, store.dispatch);

      function renderToString(reactRenderToString, element) {
        return new Promise(function (resolve, reject) {

          let html = '', resolved = false;
          let dirty = false, inProgress = false;

          const unhandledRejections = new Map();

          function unhandledRejectionHandler(reason, p) {
            unhandledRejections.set(p, reason);
          }

          function rejectionHandled(p) {
            unhandledRejections.delete(p);
          }

          onComplete = () => {
            resolved = true;
            if (!firstError) {
              resolve(html);
            } else {
              process.nextTick(() => {
                process.removeListener('unhandledRejection', unhandledRejectionHandler);
                process.removeListener('rejectionHandled', rejectionHandled);
                if (unhandledRejections.size) {
                  reject(firstError);
                } else {
                  resolve(html);
                }
              });
            }
          };

          process.on('unhandledRejection', unhandledRejectionHandler);
          process.on('rejectionHandled', rejectionHandled);

          function render() {
            if (resolved) return;
            dirty = true;
            if (inProgress) return;
            inProgress = true;
            while (dirty && !resolved) {
              dirty = false;
              html = reactRenderToString(element);
            }
            inProgress = false;
          }
          store.subscribe(render);
          render();
          if (pending === 0) onComplete();
        });
      }
      return {
        ...store,
        dispatch,
        renderToString
      };
    };
  };
}

function compose(...funcs) {
  return funcs.reduceRight((composed, f) => f(composed));
}
