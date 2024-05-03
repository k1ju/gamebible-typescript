import bcrypt from 'bcrypt';
import { UnauthorizedException } from '../exception/UnauthorizedException';

export const hashPassword = async (password) => {
    const saltRounds = 10;
    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        return hashedPassword;
    } catch (error) {
        throw new UnauthorizedException('비밀번호 해싱 중 에러 발생');
    }
};
