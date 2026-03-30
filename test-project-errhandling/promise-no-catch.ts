
      export function fetchData() {
        return fetchFromApi()
          .then(data => processData(data));
      }
    