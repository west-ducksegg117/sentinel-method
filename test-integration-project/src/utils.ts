
import _ from 'lodash';
/** Clona um objeto profundamente */
export function deepClone<T>(obj: T): T {
  return _.cloneDeep(obj);
}
