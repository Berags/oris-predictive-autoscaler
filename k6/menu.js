
/*

For menu.js nodejs is used to provide a menu to select the distribution to be used in the k6 test.
So, the menu is executed locally, but it launches k6 in a Docker container.

*/




import readline from 'readline';
import { spawn } from 'child_process';


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
    
    
    if (distributionType.toLowerCase() === 'poisson') {
        rl.question('Enter lambda values separated by commas (e.g., 3,5,10; one for each load state) [default: 3]: ', (input) => {
                
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
                
                
            // Lambda validation for Poisson distribution
                
            lambdaArray = lambdaArray.map(lambda => {
                if (lambda >= 100) {
                    console.log(`Warning: λ=${lambda} >= 100 may cause performance issues. Using λ=99.`);
                    return 99;
                }
                return lambda;
            });
                
            console.log(`Selected lambda values: [${lambdaArray.join(', ')}]`);


            rl.question('Enter test duration [in seconds; default: 600]: ', (durationInput) => {

                // Parse duration
                let duration = parseInt(durationInput.trim()) || 600;
                console.log(`Test duration: ${duration} seconds`);

                // Start the k6 test with the selected distribution and parameters
                runK6Test(distributionType, lambdaArray, duration);
            });
        });

    }else if (distributionType.toLowerCase() === 'uniform') {
        rl.question('Enter min and max values separated by a comma and separate each couple with ;. One couple for each load state (e.g., 1,10; 2,8) [default: 1,10]: ', (input) => {

        // Parse min-max pairs
        let lambdaArray;
        if (input.trim() === '') {
            lambdaArray = [[1, 10]]; // Default values as array of pairs
        } else {
            // Split by semicolon to get each couple
            const couples = input.split(';');
            lambdaArray = couples.map(couple => {
                const values = couple.split(',')
                    .map(val => parseFloat(val.trim()))
                    .filter(val => !isNaN(val));
                
                // Each couple should have exactly 2 values (min, max)
                if (values.length === 2) {
                    const [min, max] = values;
                    if (min < max) {
                        return [min, max];
                    } else {
                        console.log(`Warning: Invalid range [${min}, ${max}]. Min should be < Max. Using [${Math.min(min, max)}, ${Math.max(min, max)}]`);
                        return [Math.min(min, max), Math.max(min, max)];
                    }
                } else {
                    console.log(`Warning: Invalid couple "${couple.trim()}". Should have exactly 2 values. Skipping.`);
                    return null;
                }
            }).filter(pair => pair !== null); // Remove invalid pairs
            
            // If no valid pairs found, use default
            if (lambdaArray.length === 0) {
                console.log('No valid min-max pairs found. Using default: [1,10]');
                lambdaArray = [[1, 10]];
            }
        }
        
        console.log(`Selected min-max pairs: [${lambdaArray.map(pair => `[${pair[0]}, ${pair[1]}]`).join(', ')}]`);
        rl.question('Enter test duration [in seconds; default: 600]: ', (durationInput) => {

                // Parse duration
                let duration = parseInt(durationInput.trim()) || 600;
                console.log(`Test duration: ${duration} seconds`);

                // Start the k6 test with the selected distribution and parameters
                runK6Test(distributionType, lambdaArray, duration);
            });
        });
    }
}

function askForChoice() {
    showMenu();                                    
    rl.question('Insert your choice: ', handleChoice);
}

function handleChoice(choice) {
    switch (choice.trim()) {
        case '1':
            console.log('Initializing Binomial distribution.');
            console.log('This distribution is not implemented yet.');
            setTimeout(() => askForChoice(), 1000);
            break;
        case '2':
            console.log('Initializing Beta distribution.');
            console.log('This distribution is not implemented yet.');
            setTimeout(() => askForChoice(), 1000);
            break;
        case '3':
            console.log('Initializing Cauchy distribution.');
            console.log('This distribution is not implemented yet.');
            setTimeout(() => askForChoice(), 1000);
            break;
        case '4':
            console.log('Initializing Chi-Squared distribution.');
            console.log('This distribution is not implemented yet.');
            setTimeout(() => askForChoice(), 1000);
            break;
        case '5':
            console.log('Initializing Exponential distribution.');
            console.log('This distribution is not implemented yet.');
            setTimeout(() => askForChoice(), 1000);
            break;
        case '6':
            console.log('Initializing F distribution.');
            console.log('This distribution is not implemented yet.');
            setTimeout(() => askForChoice(), 1000);
            break;
        case '7':
            console.log('Initializing Gamma distribution.');
            console.log('This distribution is not implemented yet.');
            setTimeout(() => askForChoice(), 1000);
            break;
        case '8':
            console.log('Initializing Laplace distribution.');
            console.log('This distribution is not implemented yet.');
            setTimeout(() => askForChoice(), 1000);
            break;             
        case '9':
            console.log('Initializing Log-Normal distribution.');
            console.log('This distribution is not implemented yet.');
            setTimeout(() => askForChoice(), 1000);
            break; 
        case '10':
            console.log('Initializing Negative-Binomial distribution.');
            console.log('This distribution is not implemented yet.');
            setTimeout(() => askForChoice(), 1000);
            break; 
        case '11':
            console.log('Initializing Normal distribution.');
            console.log('This distribution is not implemented yet.');
            setTimeout(() => askForChoice(), 1000);
            break; 
        case '12':
            console.log('Initializing Poisson distribution (λ<100).');
            askLambdaValues('poisson');
            break; 
        case '13':
            console.log('Initializing Uniform distribution.');
            askLambdaValues('uniform');
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


function runK6Test(distributionType, lambdaArray = [3], duration = 600) {
    console.log(`\n Starting k6 RabbitMQ test with ${distributionType} distribution...`);
    
    // Better logging for uniform vs poisson
    if (Array.isArray(lambdaArray[0])) {
        console.log(` Parameters: ranges=[${lambdaArray.map(pair => `[${pair[0]}, ${pair[1]}]`).join(', ')}], duration=${duration} seconds`);
    } else {
        console.log(` Parameters: λ=[${lambdaArray.join(', ')}], duration=${duration} seconds`);
    }
    
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
        '-e', `TEST_DURATION=${duration}s`,
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



askForChoice(); // Avvia il programma