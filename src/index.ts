import { Context, h, Session } from "koishi";
import type {
  Condition,
  ConditionGroup,
  ConditionKey,
  ConditionLogic,
  ConditionValue,
  Config,
  Rule,
} from "./Config";

export const name = "command-interceptor";

export { Config } from "./Config";
const isCmd = Symbol("command-interceptor-is-cmd");
export function apply(ctx: Context, config: Config) {
  const rules = [...(config.rules || [])].sort(
    (a, b) => a.priority - b.priority,
  );
  ctx.on(
    "command/before-execute",
    (argv) => {
      if (!argv.session) {
        return;
      }
      argv.session[isCmd] = true;
      let cmd = argv.command.name;
      if (cmd === "help" && Array.isArray(argv.args)) {
        const sourceCmd = getCmdByElements(
          argv.session.app.config.prefix,
          argv.session.elements,
        );
        if (argv.args?.[0] === sourceCmd) {
          cmd = sourceCmd;
        }
      }
      const { whitelist, blacklist } = getRuleCommandList(argv.session, rules);
      if (blacklist.includes(cmd)) {
        return "";
      }

      if (whitelist.length > 0 && !whitelist.includes(cmd)) {
        return "";
      }
    },
    true,
  );

  ctx.on(
    "before-send",
    (_session, options) => {
      if (!options?.session || options.session[isCmd]) {
        return;
      }
      const { allowNotCommandMessage } = getRuleCommandList(
        options.session as any,
        rules,
      );
      if (allowNotCommandMessage) {
        return;
      }
      return true;
    },
    true,
  );
}

const getConditionVal: {
  [K in ConditionKey]: (session: Session) => any;
} = {
  private: (session) => session.isDirect,
  userId: (session) => session.userId,
  groupId: (session) => session.guildId,
  channelId: (session) => session.channelId,
  botId: (session) => session.bot.selfId,
  platform: (session) => session.platform,
};
const verifyConditionLogic: {
  [K in ConditionLogic]: (val: any, conditionValue: ConditionValue) => boolean;
} = {
  equalTo: (val, conditionValue) => {
    const type = typeof conditionValue;
    return type === "boolean"
      ? conditionValue === !!val
      : type === "string"
        ? conditionValue === val + ""
        : false;
  },
  notEqualTo: (val, conditionValue) =>
    !verifyConditionLogic["equalTo"](val, conditionValue),
  include: (val, conditionValue) =>
    typeof conditionValue === "object"
      ? conditionValue.value.includes(val + "")
      : verifyConditionLogic["equalTo"](val, conditionValue),
  notInclude: (val, conditionValue) =>
    !verifyConditionLogic["include"](val, conditionValue),
};
function verifyCondition(session: Session, condition: Condition) {
  return verifyConditionLogic[condition.logic](
    getConditionVal[condition.key](session),
    condition.value,
  );
}

function verifyConditionGroup(
  session: Session,
  conditionGroup: ConditionGroup,
) {
  const _verifyCondition = (condition: Condition) =>
    verifyCondition(session, condition);
  return conditionGroup.internalLogic === "and"
    ? conditionGroup.conditions.every(_verifyCondition)
    : conditionGroup.conditions.some(_verifyCondition);
}

function verifyConditionGroups(
  session: Session,
  conditionGroups: ConditionGroup[],
) {
  let logicStatus: boolean = null;
  for (const conditionGroup of conditionGroups) {
    const res = verifyConditionGroup(session, conditionGroup);
    const isAnd = conditionGroup.externalLogic === "and";
    logicStatus =
      logicStatus === null
        ? res
        : isAnd
          ? logicStatus && res
          : logicStatus || res;
    if (isAnd ? !logicStatus : logicStatus) {
      break;
    }
  }
  return logicStatus;
}

function getRuleCommandList(
  session: Session,
  rules: Rule[],
): {
  whitelist: string[];
  blacklist: string[];
  allowNotCommandMessage: boolean;
} {
  const whitelist: string[] = [];
  const blacklist: string[] = [];
  let allowNotCommandMessage = true;
  for (let rule of rules) {
    const res = verifyConditionGroups(session, rule.conditionGroups);
    if (!res) {
      continue;
    }
    const isWhite = rule.type === "whitelist";
    if (isWhite) {
      whitelist.push(...(rule.command || []));
    } else {
      blacklist.push(...(rule.command || []));
    }
    if (allowNotCommandMessage) {
      allowNotCommandMessage = isWhite
        ? rule.notCommandMessage
        : !rule.notCommandMessage;
    }
  }
  return { whitelist, blacklist, allowNotCommandMessage };
}

function cutElementsToFirstText(elements: h[]) {
  elements = [...elements];
  const firstTextIndex = elements.findIndex((ele) => ele.type === "text");
  if (firstTextIndex > 0) {
    elements.splice(0, firstTextIndex);
  }
  return elements;
}

function getCmdByElements(prefix: string[], elements: h[]): string {
  elements = cutElementsToFirstText(elements);
  let cmd: string = elements[0].attrs["content"]?.trim() + "";
  prefix?.forEach((p: string) => {
    cmd = cmd.replace(new RegExp("^" + p), "").trim();
  });
  return cmd.split(/\s/)[0];
}
