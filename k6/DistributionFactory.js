import probabilityDistributions from './lib/index.js';

class DistributionFactory {

    static getFromType(type, ...params){
        if (type.toLowerCase() == "exponential" || type.toLowerCase() == "poisson"){
            return this.getExponential(params[0]);
        } else if (type.toLowerCase() == "uniform"){
            return this.getUniform(params[0], params[1]);
        } else if (type.toLowerCase() == "deterministic"){
            return this.getDeterministic(params[0]);
        } else {
            throw new Error("The given distribution type is not supported");
        } 
    }

    static getUniform(min, max){
        return () => probabilityDistributions.runif(min, max);
    }

    static getDeterministic(time){
        return () => time;
    }

    static getExponential(lambda){
        return () => probabilityDistributions.rexp(lambda);
    }
}
