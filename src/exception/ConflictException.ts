import { Exception } from './Exception';

export class ConflictException extends Exception {
    constructor(message: string, err = null) {
        super(409, message, err);
    }
}
