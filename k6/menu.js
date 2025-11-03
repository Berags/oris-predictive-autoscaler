/*

For menu.js nodejs is used to provide a menu to select the distribution to be used in the k6 test.
So, the menu is executed locally, but it launches k6 in a Docker container.

*/

import readline from "readline";
import { spawn } from "child_process";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Variable to track current Docker process
let currentDockerProcess = null;

// Handle SIGINT (Ctrl+C) to properly stop Docker containers
process.on("SIGINT", () => {
  console.log("\n  Interruption signal received. Stopping k6 test...");
  if (currentDockerProcess) {
    currentDockerProcess.kill("SIGINT");
  }

  rl.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n  Termination signal received. Stopping k6 test...");
  if (currentDockerProcess) {
    currentDockerProcess.kill("SIGTERM");
  }
  rl.close();
  process.exit(0);
});

const RABBITMQ_HOST = process.env.RABBITMQ_HOST || "localhost";
const RABBITMQ_USER = process.env.RABBITMQ_USER || "admin";
const RABBITMQ_PASSWORD = process.env.RABBITMQ_PASSWORD || "password";
const RABBITMQ_PORT = process.env.RABBITMQ_PORT || "5672";
const K6_IMAGE_NAME = process.env.K6_IMAGE_NAME || "k6-amqp:latest";
const SCRIPT_DIR = process.env.SCRIPT_DIR || __dirname;

const showMenu = () => {
  console.log("1. Exponential");
  console.log("2. Poisson (λ<100)");
  console.log("3. Uniform (Use min = max for deterministic)");
  console.log("4. Erlang (k, λ)");
  console.log("5. Hyper Erlang (k, λ, weight)");
  console.log("6. Exit");
  console.log("----------------------------");
};

const distributionHandlers = {
  poisson: () => {
    const distributionType = "poisson";
    console.log(`\nConfiguring ${distributionType} distribution test:`);
    rl.question(
      "Enter lambda values separated by commas (e.g., 3,5,10; one for each load state) [default: 3]: ",
      (input) => {
        let lambdaArray;
        if (input.trim() === "") {
          lambdaArray = [3];
        } else {
          lambdaArray = input
            .split(",")
            .map((val) => parseFloat(val.trim()))
            .filter((val) => !isNaN(val) && val > 0);
          if (lambdaArray.length === 0) {
            console.log("Invalid lambda values. Using default: [3]");
            lambdaArray = [3];
          }
        }
        lambdaArray = lambdaArray.map((lambda) => {
          if (lambda >= 100) {
            console.log(
              `Warning: λ=${lambda} >= 100 may cause performance issues. Using λ=99.`
            );
            return 99;
          }
          return lambda;
        });
        console.log(`Selected lambda values: [${lambdaArray.join(", ")}]`);
        rl.question(
          "Enter test duration [in seconds; default: 600]: ",
          (durationInput) => {
            let duration = parseInt(durationInput.trim()) || 600;
            console.log(`Test duration: ${duration} seconds`);
            runK6Test(distributionType, lambdaArray, duration);
          }
        );
      }
    );
  },
  uniform: () => {
    const distributionType = "uniform";
    console.log(`\nConfiguring ${distributionType} distribution test:`);
    rl.question(
      "Enter min and max values separated by a comma and separate each couple with ;. One couple for each load state (e.g., 1,10; 2,8) [default: 1,10]: ",
      (input) => {
        let lambdaArray;
        if (input.trim() === "") {
          lambdaArray = [[1, 10]];
        } else {
          const couples = input.split(";");
          lambdaArray = couples
            .map((couple) => {
              const values = couple
                .split(",")
                .map((val) => parseFloat(val.trim()))
                .filter((val) => !isNaN(val));
              if (values.length === 2) {
                const [min, max] = values;
                if (min < max || min === max) {
                  return [min, max];
                } else {
                  console.log(
                    `Warning: Invalid range [${min}, ${max}]. Min should be < Max. Using [${Math.min(
                      min,
                      max
                    )}, ${Math.max(min, max)}]`
                  );
                  return [Math.min(min, max), Math.max(min, max)];
                }
              } else {
                console.log(
                  `Warning: Invalid couple "${couple.trim()}". Should have exactly 2 values. Skipping.`
                );
                return null;
              }
            })
            .filter((pair) => pair !== null);
          if (lambdaArray.length === 0) {
            console.log("No valid min-max pairs found. Using default: [1,10]");
            lambdaArray = [[1, 10]];
          }
        }
        console.log(
          `Selected min-max pairs: [${lambdaArray
            .map((pair) => `[${pair[0]}, ${pair[1]}]`)
            .join(", ")}]`
        );
        rl.question(
          "Enter test duration [in seconds; default: 600]: ",
          (durationInput) => {
            let duration = parseInt(durationInput.trim()) || 600;
            console.log(`Test duration: ${duration} seconds`);
            runK6Test(distributionType, lambdaArray, duration);
          }
        );
      }
    );
  },
  hypererlang: () => {
    const distributionType = "hypererlang";
    console.log(`\nConfiguring ${distributionType} distribution test:`);
    rl.question("Enter k (shape), lambda and weight values with the format k1, λ1, w1; k2, λ2, w2: ", (kInput) => {
      const params = kInput.split(";").map((pair) => pair.split(",").map((val) => parseFloat(val.trim())));
      const validParams = params.filter(([k, lambda, weight]) => !isNaN(k) && !isNaN(lambda) && !isNaN(weight));
      if (validParams.length === 0) {
        console.log("Invalid input. Using default: k=2, λ=3, w=1");
        validParams.push([2, 3, 1]);
      }

    
      const phases = validParams.map(([k, lambda, weight]) => [k, lambda]);
      const weights = validParams.map(([k, lambda, weight]) => weight);
      
      const weightSum = weights.reduce((sum, w) => sum + w, 0);
      const normalizedWeights = weights.map(w => w / weightSum);
      
      const hyperErlangParams = [phases, normalizedWeights];
      
      console.log(`Phases: ${JSON.stringify(phases)}`);
      console.log(`Weights: ${JSON.stringify(normalizedWeights)}`);

      rl.question(
        "Enter test duration [in seconds; default: 600]: ",
        (durationInput) => {
            let duration = parseInt(durationInput.trim()) || 600;
            console.log(`Test duration: ${duration} seconds`);

          
            runK6Test(distributionType, [hyperErlangParams], duration);
          }
      );
    });
  },
  erlang: () => {
    const distributionType = "erlang";
    console.log(`\nConfiguring ${distributionType} distribution test:`);
    rl.question("Enter k (shape) value: ", (kInput) => {
      let k = parseInt(kInput.trim());
      if (isNaN(k) || k <= 0) {
        console.log("Invalid k value. Using default: 2");
        k = 2;
      }
      rl.question(
        "Enter lambda values separated by commas (e.g., 3,5,10; one for each load state) [default: 3]: ",
        (input) => {
          let lambdaArray;
          if (input.trim() === "") {
            lambdaArray = [3];
          } else {
            lambdaArray = input
              .split(",")
              .map((val) => parseFloat(val.trim()))
              .filter((val) => !isNaN(val) && val > 0);
            if (lambdaArray.length === 0) {
              console.log("Invalid lambda values. Using default: [3]");
              lambdaArray = [3];
            }
          }
          /*
          lambdaArray = lambdaArray.map((lambda) => {
            if (lambda >= 100) {
              console.log(
                `Warning: λ=${lambda} >= 100 may cause performance issues. Using λ=99.`
              );
              return 99;
            }
            return lambda;
          }); */

          const erlangParams = lambdaArray.map((lambda) => [k, lambda]);

          console.log(
            `Selected Erlang parameters: k=${k}, λ=[${lambdaArray.join(", ")}]`
          );
          rl.question(
            "Enter test duration [in seconds; default: 600]: ",
            (durationInput) => {
              let duration = parseInt(durationInput.trim()) || 600;
              console.log(`Test duration: ${duration} seconds`);

              runK6Test(distributionType, erlangParams, duration);
            }
          );
        }
      );
    });
  },
  default: () => {
    console.log("This distribution is not implemented yet.");
    setTimeout(() => menu(), 1000);
  },
};

const getParameter = (distributionType) => {
  const distribution = distributionType.toLowerCase();
  const handler =
    distributionHandlers[distribution] || distributionHandlers["default"];
  handler();
};

const menu = () => {
  showMenu();
  rl.question("Insert your choice: ", handleChoice);
};

const menuActions = {
  1: { name: 'Exponential', handler: () => getParameter('poisson') },
  2: { name: "Poisson (λ<100)", handler: () => getParameter("poisson") },
  3: {
    name: "Uniform (Use min = max for deterministic)",
    handler: () => getParameter("uniform"),
  },
  4: { name: "Erlang", handler: () => getParameter("erlang") },
  5: { name: "Hyper Erlang", handler: () => getParameter("hyperErlang") },
  6: {
    name: "Exit",
    handler: () => {
      console.log("Exiting program. Goodbye!");
      rl.close();
    },
  },
};

const handleChoice = (choice) => {
  const action = menuActions[choice.trim()];

  if (action) {
    if (action.name !== "Exit") {
      console.log(`Initializing ${action.name} distribution.`);
    }
    action.handler();
  } else {
    console.log("Invalid choice, please try again.");
    setTimeout(menu, 1000);
  }
};

const runK6Test = (distributionType, paramArray = [3], duration = 600) => {
  console.log(
    `\n Starting k6 RabbitMQ test with ${distributionType} distribution...`
  );

  if (distributionType === "erlang") {
    //  Erlang: paramArray = [[k1, λ1], [k2, λ2], ...]
    console.log(
      ` Parameters: Erlang pairs=[${paramArray
        .map((pair) => `[k=${pair[0]}, λ=${pair[1]}]`)
        .join(", ")}], duration=${duration} seconds`
    );
  } else if (distributionType === "uniform") {
    // Uniform: paramArray = [[min1, max1], [min2, max2], ...]
    console.log(
      ` Parameters: ranges=[${paramArray
        .map((pair) => `[${pair[0]}, ${pair[1]}]`)
        .join(", ")}], duration=${duration} seconds`
    );
  } else if (
    distributionType === "poisson" ||
    distributionType === "exponential"
  ) {
    // Per Poisson/Exponential: paramArray = [λ1, λ2, ...]
    console.log(
      ` Parameters: λ=[${paramArray.join(", ")}], duration=${duration} seconds`
    );
  }else if (distributionType === "hypererlang") {
    
    const [phases, weights] = paramArray[0]; // Extract phases and weights
    console.log(
      ` Parameters: Phases=${JSON.stringify(phases)}, Weights=${JSON.stringify(weights)}, duration=${duration} seconds`
    );
  }

  console.log(` RabbitMQ: ${RABBITMQ_USER}@${RABBITMQ_HOST}:${RABBITMQ_PORT}`);
  console.log(" Press Ctrl+C to stop the test at any time\n");

  const paramJson = JSON.stringify(paramArray);

  currentDockerProcess = spawn(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "host",
      "-e",
      `RABBITMQ_HOST=${RABBITMQ_HOST}`,
      "-e",
      `RABBITMQ_USER=${RABBITMQ_USER}`,
      "-e",
      `RABBITMQ_PASSWORD=${RABBITMQ_PASSWORD}`,
      "-e",
      `RABBITMQ_PORT=${RABBITMQ_PORT}`,
      "-e",
      `TEST_DURATION=${duration}s`,
      "-e",
      `PARAM_ARRAY=${paramJson}`,
      "-e",
      `DISTRIBUTION=${distributionType.toLowerCase()}`,
      K6_IMAGE_NAME,
      "run",
      "/k6/rabbitmq-test.js",
    ],
    {
      stdio: "inherit",
    }
  );

  currentDockerProcess.on("close", (code) => {
    currentDockerProcess = null;

    if (code === 0) {
      console.log(
        `\n k6 test with ${distributionType} distribution completed successfully!`
      );
    } else if (code === 130 || code === null) {
      console.log(`\n  k6 test was interrupted`);
    } else {
      console.log(`\n k6 test failed with exit code ${code}`);
    }

    console.log("\n Press Enter to return to menu...");
    process.stdin.once("data", () => {
      menu();
    });
  });

  currentDockerProcess.on("error", (error) => {
    currentDockerProcess = null;
    console.error(` Error running Docker k6: ${error.message}`);
    console.log(" Make sure Docker is running and the k6 image is built");

    setTimeout(() => {
      menu();
    }, 2000);
  });
};

menu();
