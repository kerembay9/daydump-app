// Stands in for @expo/ui/* on Android (see metro.config.js). Every export (and sub-export like DropdownMenu.Trigger)
// is a function: called with a props object, i.e. rendered as a component, it throws; called otherwise, like the
// modifier fillMaxHeight() that expo-router calls at import time, it returns another stub.
const stub = (name) =>
  new Proxy(() => {}, {
    get: (target, key) => {
      if (key === 'displayName') return name;
      // Built-ins (toString, name...) stay real, and no prototype keeps React on the function-component path.
      if (typeof key !== 'string' || key === 'prototype' || key in target) return Reflect.get(target, key);
      return stub(`${name}.${key}`);
    },
    apply: (_, __, [props]) => {
      if (props && typeof props === 'object') {
        throw new Error(`${name} needs @expo/ui, which is excluded from the Android build; see metro.config.js`);
      }
      return stub(`${name}()`);
    },
  });

module.exports = new Proxy({}, { get: (_, key) => (key === '__esModule' ? false : stub(String(key))) });
