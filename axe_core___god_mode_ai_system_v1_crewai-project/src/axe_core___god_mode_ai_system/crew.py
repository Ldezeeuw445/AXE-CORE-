import os
import logging

from crewai import LLM
from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task

log = logging.getLogger("axe_crew")


def _ollama_llm(model: str) -> LLM:
    return LLM(model=model, base_url=os.environ.get("OLLAMA_HOST", "http://localhost:11434"))


@CrewBase
class AxeCoreGodModeAiSystemCrew:
    """AxeCoreGodModeAiSystem crew — no tools (Ollama does not support function calls)."""

    @agent
    def axe_core___master_orchestrator(self) -> Agent:
        return Agent(
            config=self.agents_config["axe_core___master_orchestrator"],
            llm=_ollama_llm("ollama/llama3"),
            reasoning=False,
            max_reasoning_attempts=None,
            inject_date=True,
            allow_delegation=False,
            max_iter=25,
            max_rpm=None,
            max_execution_time=None,
        )

    @agent
    def wags___developer_specialist(self) -> Agent:
        return Agent(
            config=self.agents_config["wags___developer_specialist"],
            llm=_ollama_llm("ollama/qwen2.5-coder:7b"),
            reasoning=False,
            max_reasoning_attempts=None,
            inject_date=True,
            allow_delegation=False,
            max_iter=25,
            max_rpm=None,
            max_execution_time=None,
        )

    @agent
    def dollar_bill___finance_and_trading_specialist(self) -> Agent:
        return Agent(
            config=self.agents_config["dollar_bill___finance_and_trading_specialist"],
            llm=_ollama_llm("ollama/mistral"),
            reasoning=False,
            max_reasoning_attempts=None,
            inject_date=True,
            allow_delegation=False,
            max_iter=25,
            max_rpm=None,
            max_execution_time=None,
        )

    @agent
    def intel___research_specialist(self) -> Agent:
        return Agent(
            config=self.agents_config["intel___research_specialist"],
            llm=_ollama_llm("ollama/llama3"),
            reasoning=False,
            max_reasoning_attempts=None,
            inject_date=True,
            allow_delegation=False,
            max_iter=25,
            max_rpm=None,
            max_execution_time=None,
        )

    @agent
    def sentinel___automation_specialist(self) -> Agent:
        return Agent(
            config=self.agents_config["sentinel___automation_specialist"],
            llm=_ollama_llm("ollama/mistral"),
            reasoning=False,
            max_reasoning_attempts=None,
            inject_date=True,
            allow_delegation=False,
            max_iter=25,
            max_rpm=None,
            max_execution_time=None,
        )

    @agent
    def forge___infrastructure_and_build_specialist(self) -> Agent:
        return Agent(
            config=self.agents_config["forge___infrastructure_and_build_specialist"],
            llm=_ollama_llm("ollama/qwen2.5-coder:7b"),
            reasoning=False,
            max_reasoning_attempts=None,
            inject_date=True,
            allow_delegation=False,
            max_iter=25,
            max_rpm=None,
            max_execution_time=None,
        )

    @agent
    def pulse___system_monitoring_specialist(self) -> Agent:
        return Agent(
            config=self.agents_config["pulse___system_monitoring_specialist"],
            llm=_ollama_llm("ollama/llama3"),
            reasoning=False,
            max_reasoning_attempts=None,
            inject_date=True,
            allow_delegation=False,
            max_iter=25,
            max_rpm=None,
            max_execution_time=None,
        )

    @agent
    def atlas___memory_and_knowledge_specialist(self) -> Agent:
        return Agent(
            config=self.agents_config["atlas___memory_and_knowledge_specialist"],
            llm=_ollama_llm("ollama/llama3"),
            reasoning=False,
            max_reasoning_attempts=None,
            inject_date=True,
            allow_delegation=False,
            max_iter=25,
            max_rpm=None,
            max_execution_time=None,
        )

    @agent
    def nova___product_strategy_specialist(self) -> Agent:
        return Agent(
            config=self.agents_config["nova___product_strategy_specialist"],
            llm=_ollama_llm("ollama/llama3"),
            reasoning=False,
            max_reasoning_attempts=None,
            inject_date=True,
            allow_delegation=False,
            max_iter=25,
            max_rpm=None,
            max_execution_time=None,
        )

    @task
    def axe_intake_and_route(self) -> Task:
        return Task(config=self.tasks_config["axe_intake_and_route"], markdown=False)

    @task
    def wags_development_task(self) -> Task:
        return Task(config=self.tasks_config["wags_development_task"], markdown=False)

    @task
    def intel_research_task(self) -> Task:
        return Task(config=self.tasks_config["intel_research_task"], markdown=False)

    @task
    def sentinel_automation_task(self) -> Task:
        return Task(config=self.tasks_config["sentinel_automation_task"], markdown=False)

    @task
    def forge_infrastructure_task(self) -> Task:
        return Task(config=self.tasks_config["forge_infrastructure_task"], markdown=False)

    @task
    def pulse_monitoring_task(self) -> Task:
        return Task(config=self.tasks_config["pulse_monitoring_task"], markdown=False)

    @task
    def nova_strategy_task(self) -> Task:
        return Task(config=self.tasks_config["nova_strategy_task"], markdown=False)

    @task
    def atlas_memory_task(self) -> Task:
        return Task(config=self.tasks_config["atlas_memory_task"], markdown=False)

    @task
    def dollar_bill_finance_task(self) -> Task:
        return Task(config=self.tasks_config["dollar_bill_finance_task"], markdown=False)

    @task
    def axe_final_response(self) -> Task:
        return Task(config=self.tasks_config["axe_final_response"], markdown=False)

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=False,
            chat_llm=_ollama_llm("ollama/llama3"),
        )


def run_crew_kickoff(specialists: list, user_request: str) -> str:
    crew_obj = AxeCoreGodModeAiSystemCrew()
    methods = {
        "axe_core": "axe_core___master_orchestrator",
        "wags": "wags___developer_specialist",
        "dollar_bill": "dollar_bill___finance_and_trading_specialist",
        "intel": "intel___research_specialist",
        "sentinel": "sentinel___automation_specialist",
        "forge": "forge___infrastructure_and_build_specialist",
        "pulse": "pulse___system_monitoring_specialist",
        "atlas": "atlas___memory_and_knowledge_specialist",
        "nova": "nova___product_strategy_specialist",
    }
    agents = []
    for key in specialists:
        m = methods.get(str(key))
        if m and hasattr(crew_obj, m):
            try:
                agents.append(getattr(crew_obj, m)())
            except Exception as e:  # noqa: BLE001
                log.warning("Specialist %s failed: %s", key, e)
    if not agents:
        agents.append(getattr(crew_obj, methods["axe_core"])())

    tasks = [
        Task(description=user_request, expected_output="A clear, complete answer for the user, in the same language as the request.", agent=agent)
        for agent in agents
    ]

    sub = Crew(
        agents=agents,
        tasks=tasks,
        process=Process.sequential,
        verbose=False,
        chat_llm=_ollama_llm("ollama/llama3"),
    )
    result = sub.kickoff()
    return getattr(result, "raw", None) or str(result)
