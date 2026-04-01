import chalk from "chalk";

const SF_BLUE = "#00A1E0";
const SF_LIGHT = "#54C7EC";

export function renderGreeting(): string {
  const blue = chalk.hex(SF_BLUE);
  const light = chalk.hex(SF_LIGHT);
  const bold = chalk.hex(SF_BLUE).bold;
  const dim = chalk.dim;

  const astro = [
    `   ${dim("╭──────╮")}`,
    `   ${dim("│")} ${light("◉  ◉")} ${dim("│")}      ${bold("╦  ╦╦╔╗ ╔═╗╔═╗╔═╗╦═╗╔═╗╔═╗")}`,
    `   ${dim("│")}  ${light("──")}  ${dim("│")}      ${bold("╚╗╔╝║╠╩╗║╣ ╠╣ ║ ║╠╦╝║  ║╣")}`,
    `   ${dim("╰──┬┬──╯")}       ${bold("╚╝ ╩╚═╝╚═╝╚  ╚═╝╩╚═╚═╝╚═╝")}`,
    `   ${dim("┌──┘└──┐")}`,
    `   ${dim("│")} ${blue("╔══╗")} ${dim("│")}      ${chalk.white("The Salesforce Vibe Coding Agent")}`,
    `   ${dim("│")} ${blue("║██║")} ${dim("│")}      ${dim("Type anything to get started.")}`,
    `   ${dim("└──────┘")}`,
  ];

  return "\n" + astro.join("\n") + "\n";
}
