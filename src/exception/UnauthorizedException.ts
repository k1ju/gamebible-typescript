import { Exception } from './Exception';

export class UnauthorizedException extends Exception {
    constructor(message: string, err = null) {
        super(401, message, err);
    }
}
