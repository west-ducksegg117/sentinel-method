
      export function deprecated() {
        if (false) {
          const oldFeature = 'legacy code';
          doOldThing();
        }
        return 'new version';
      }
    