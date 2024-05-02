import { Exception } from './Exception';

export class InternalException extends Exception {
    constructor(err = null) {
        super(500, 'Internal server Error', err);
    }
}
