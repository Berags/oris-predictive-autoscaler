
/*

For menu.js nodejs is used to provide a menu to select the distribution to be used in the k6 test.
So, the menu is executed locally, but it launches k6 in a Docker container.

*/




import readline from 'readline';
import { spawn } from 'child_process';
import path from 'path';

const rl = readline.createInterface({
    input: process.stdin,   
    output: process.stdout  
});

// Variable to track current Docker process
let currentDockerProcess = null;

// Handle SIGINT (Ctrl+C) to properly stop Docker containers
process.on('SIGINT', () => {
    console.log('\n  Interruption signal received. Stopping k6 test...');
    if (currentDockerProcess) {
        currentDockerProcess.kill('SIGINT');
    }
    rl.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n  Termination signal received. Stopping k6 test...');
    if (currentDockerProcess) {
        currentDockerProcess.kill('SIGTERM');
    }
    rl.close();
    process.exit(0);
});

const RABBITMQ_HOST = process.env.RABBITMQ_HOST || 'localhost';
const RABBITMQ_USER = process.env.RABBITMQ_USER || 'admin';
const RABBITMQ_PASSWORD = process.env.RABBITMQ_PASSWORD || 'password';
const RABBITMQ_PORT = process.env.RABBITMQ_PORT || '5672';
const K6_IMAGE_NAME = process.env.K6_IMAGE_NAME || 'k6-amqp:latest';
const SCRIPT_DIR = process.env.SCRIPT_DIR || __dirname;


function showMenu(){
    console.log("---Distribution Test Menu---");
    
    console.log("1. Binomial");
    console.log("2. Beta");
    console.log("3. Cauchy");
    console.log("4. Chi-Squared ");
    console.log("5. Exponential");
    console.log("6. F");
    console.log("7. Gamma");
    console.log("8. Laplace");
    console.log("9. Log-Normal ");
    console.log("10. Negative-Binomial ");
    console.log("11. Normal");
    console.log("12. Poisson (λ<100)");
    console.log("13. Uniform");
    console.log("14. Exit");
    console.log("----------------------------");

}


function askLambdaValues(distributionType) {
    console.log(`\nConfiguring ${distributionType} distribution test:`);
    rl.question('Enter lambda values separated by commas (e.g., 3,5,10) [default: 3]: ', (input) => {
        rl.question('Enter test duration [in seconds; default: 600s]: ', (durationInput) => {
            
            // Parse lambda values
            let lambdaArray;
            if (input.trim() === '') {
                lambdaArray = [3]; // Default value
            } else {
                lambdaArray = input.split(',')
                    .map(val => parseFloat(val.trim()))
                    .filter(val => !isNaN(val) && val > 0);
                
                if (lambdaArray.length === 0) {
                    console.log('Invalid lambda values. Using default: [3]');
                    lambdaArray = [3];
                }
            }
            
            // Parse duration
            let duration = durationInput.trim() || '600';
            duration *=1000; // Convert to milliseconds
            
            // Validation for Poisson distribution
            if (distributionType.toLowerCase() === 'poisson') {
                lambdaArray = lambdaArray.map(lambda => {
                    if (lambda >= 100) {
                        console.log(`Warning: λ=${lambda} >= 100 may cause performance issues. Using λ=99.`);
                        return 99;
                    }
                    return lambda;
                });
            }
            
            console.log(`Selected lambda values: [${lambdaArray.join(', ')}]`);
            console.log(`Test duration: ${duration}`);
            
            runK6Test(distributionType, lambdaArray, duration);
        });
    });
}



function askForChoice() {
    showMenu();                                    
    rl.question('Insert your choice: ', handleChoice);
}

function handleChoice(choice) {
    switch (choice.trim()) {
        case '1':
            console.log('Initializing Binomial distribution.');
            break;
        case '2':
            console.log('Initializing Beta distribution.');
            break;
        case '3':
            console.log('Initializing Cauchy distribution.');
            break;
        case '4':
            console.log('Initializing Chi-Squared distribution.');
            break;
        case '5':
            console.log('Initializing Exponential distribution.');
            break;
        case '6':
            console.log('Initializing F distribution.');
            break;
        case '7':
            console.log('Initializing Gamma distribution.');
            break;
        case '8':
            console.log('Initializing Laplace distribution.');
            break;             
        case '9':
            console.log('Initializing Log-Normal distribution.');
            break; 
        case '10':
            console.log('Initializing Negative-Binomial distribution.');
            break; 
        case '11':
            console.log('Initializing Normal distribution.');
            break; 
        case '12':
            console.log('Initializing Poisson distribution (λ<100).');
            askLambdaValues('poisson');
            break; 
        case '13':
            console.log('Initializing Uniform distribution.');
            break; 
        case '14':
            console.log('Exiting program. Goodbye!');
            rl.close();
            return; 
        default:
            console.log('Invalid choice, please try again.');
            askForChoice();
    }
}








function runK6Test(distributionType, lambdaArray = [3], duration = '600s') {
    console.log(`\n Starting k6 RabbitMQ test with ${distributionType} distribution...`);
    console.log(` Parameters: λ=[${lambdaArray.join(', ')}], duration=${duration}`);
    console.log(` RabbitMQ: ${RABBITMQ_USER}@${RABBITMQ_HOST}:${RABBITMQ_PORT}`);
    console.log(' Press Ctrl+C to stop the test at any time\n');

    const lambdaJson = JSON.stringify(lambdaArray);
    
    // Usa Docker per lanciare k6 (come nel build-and-run.sh originale)
    currentDockerProcess = spawn('docker', [
        'run', '--rm',
        '--network', 'host',
        '-v', `${SCRIPT_DIR}:/scripts`,
        '-v', `${process.cwd()}:/output`,
        '-e', `RABBITMQ_HOST=${RABBITMQ_HOST}`,
        '-e', `RABBITMQ_USER=${RABBITMQ_USER}`,
        '-e', `RABBITMQ_PASSWORD=${RABBITMQ_PASSWORD}`,
        '-e', `RABBITMQ_PORT=${RABBITMQ_PORT}`,
        '-e', `TEST_DURATION=${duration}`,
         '-e', `LAMBDA_ARRAY=${lambdaJson}`, 
        '-e', `DISTRIBUTION=${distributionType.toLowerCase()}`,
        K6_IMAGE_NAME,
        'run', '/scripts/rabbitmq-test.js'
    ], {
        stdio: 'inherit'
    });

    currentDockerProcess.on('close', (code) => {
        currentDockerProcess = null; // Clear the reference
        
        if (code === 0) {
            console.log(`\n k6 test with ${distributionType} distribution completed successfully!`);
        } else if (code === 130 || code === null) {
            console.log(`\n  k6 test was interrupted`);
        } else {
            console.log(`\n k6 test failed with exit code ${code}`);
        }
        
        console.log('\n Press Enter to return to menu...');
        process.stdin.once('data', () => {
            askForChoice();
        });
    });

    currentDockerProcess.on('error', (error) => {
        currentDockerProcess = null; // Clear the reference
        console.error(` Error running Docker k6: ${error.message}`);
        console.log(' Make sure Docker is running and the k6 image is built');
        
        setTimeout(() => {
            askForChoice();
        }, 2000);
    });
}

askForChoice();